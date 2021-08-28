const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment')
moment.updateLocale('en', {
    week: {
        dow: 1, // Monday is the first day of the week.
    }
});

const { categories, summaries, recurring, defaults } = require('./constants.json')
const { summaryMessageBuilder, recurringMessageBuilder, capitalize } = require('./helpers')
const { getAllRecurringPayments, deleteRecurringPayment, writeToTable, getExpenses, createExpenseTable, updateRecurringExpense } = require('./dbHandler')

require('dotenv').config()
const bot = new TelegramBot(process.env.TOKEN, { polling: true });
bot.on("polling_error", console.log);

/**
 * state --> keeps track of current position in decision tree
 * category --> keeps track of selected category if any
 */
let state = null
let selected_category = null

// create table
const tableSetup = async () => {
    let isSuccess = await createExpenseTable()
    if (isSuccess) {
        console.log(`Table: ${process.env.TABLE_NAME} successfully created`)
    }
}
tableSetup()

/**
 * return to default options
 */
bot.onText(new RegExp(`(\/start|${defaults.back})`), (msg, match) => {
    const chatId = msg.chat.id;
    state = null
    bot.sendMessage(chatId, defaults.start, getDefaultOptions())
})

/**
 * Initial action selected
 */
bot.onText(new RegExp(`${defaults.expense}|${defaults.recurring}|${defaults.summary}`), (msg, match) => {
    const chatId = msg.chat.id;
    const message = msg.text;
    if (message.includes(defaults.expense)) {
        state = 'expense'
        bot.sendMessage(chatId, defaults.select_category, getOptions(categories, 3))
    }
    if (message.includes(defaults.recurring)) {
        state = 'recurring'
        bot.sendMessage(chatId, defaults.select_action, getOptions(recurring, 2))
    }
    if (message.includes(defaults.summary)) {
        state = 'request summary'
        bot.sendMessage(chatId, defaults.select_action, getOptions(summaries, 2))
    }
})

/**
 * expense: after category selection
 */
let catRegex = new RegExp(`(${categories.food.message}|${categories.gifts.message}|${categories.bills.message}|${categories.transport.message}|${categories.clothes.message}|${categories.others.message})`)
bot.onText(catRegex, (msg, match) => {
    const chatId = msg.chat.id;
    let cat = msg.text.split(" ")
    if (cat.length > 1 && cat[1].toLowerCase() in categories) {
        selected_category = cat[1].toLowerCase()
        bot.sendMessage(chatId, defaults.expense_amount_input)
    }
})

/**
 * matches numeric only input
 */
bot.onText(/^\d+(\.\d+)*$/, (msg, match) => {
    const chatId = msg.chat.id;
    if (selected_category != null) {
        let item = { type: 'expense', tag: selected_category, value: msg.text }
        let is_success = writeToTable(item)
        selected_category = null
        if (is_success)
            bot.sendMessage(chatId, defaults.expense_add_success, getDefaultOptions())
        else
            bot.sendMessage(chatId, defaults.expense_add_failure, getDefaultOptions())
    } else {
        bot.sendMessage(chatId, defaults.expense_amount_input)
    }
    state = null
})

bot.onText(new RegExp(`${recurring.add.message}|${recurring.delete.message}`), (msg, match) => {
    options = [defaults.recurring_this_month, defaults.recurring_next_month]
    let res = ''
    console.log(msg.text)
    if (msg.text == recurring.add.message) {
        state = recurring.add.message
        res = 'Please select when this recurring payment will start'
    }
    if (msg.text == recurring.delete.message) {
        state = recurring.delete.message
        res = 'When will this take effect from?'
    }
    let keyboard = genericKeyboardBuilder(options, 2, true)
    let data = { 'reply_markup': JSON.stringify(keyboard) }
    bot.sendMessage(msg.chat.id, res, data)
})

bot.onText(new RegExp(`${defaults.recurring_this_month}|${defaults.recurring_next_month}`), async (msg, match) => {
    // ask when recurring payment starts
    selected_category = msg.text
    if (state == recurring.add.message) {
        let keyboard = genericKeyboardBuilder([], 0, true)
        bot.sendMessage(msg.chat.id, defaults.recurring_add_prompt, { 'reply_markup': JSON.stringify(keyboard) })
    }
    if (state == recurring.delete.message) {
        let payments = await getAllRecurringPayments()
        bot.sendMessage(msg.chat.id, defaults.recurring_delete_prompt, getRecurringPaymentOptions(payments, 2))
    }
})

/**
 * recurring payments: view all recurring payments
 */
bot.onText(new RegExp(`${recurring.view.message}`), async (msg, match) => {
    let retrievedItems = await getAllRecurringPayments()
    let resp = recurringMessageBuilder(retrievedItems)
    bot.sendMessage(msg.chat.id, resp, { parse_mode: 'HTML' })
    state = null
})

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const message = msg.text;
    // add new recurring payment
    if (state == recurring.add.message
        && (selected_category == defaults.recurring_this_month || selected_category == defaults.recurring_next_month)
        && message != defaults.back) {
        let isValid = isAddRecurringInput(message)
        if (isValid) {
            let msgArr = message.split(" ")
            let tag = msgArr.slice(0, msgArr.length - 1).join(" ").toLowerCase()
            let value = msgArr[msgArr.length - 1]
            // register new recurring payment 
            let isAdded = writeToTable({ tag, value, type: 'recurring' })
            // updated existing month's recurring payment
            if (selected_category == defaults.recurring_this_month)
                updateRecurringExpense(parseFloat(value), true)
            let reply = isAdded ? defaults.recurring_add_success : defaults.recurring_add_failure
            bot.sendMessage(chatId, reply, getDefaultOptions())
        } else {
            bot.sendMessage(chatId, defaults.recurring_add_format_error, getDefaultOptions())
        }
        selected_category = null
        state = null
    }
    // remove selected recurring payment
    if (state == recurring.delete.message
        && (selected_category == defaults.recurring_this_month || selected_category == defaults.recurring_next_month)
        && message != defaults.back) {
        let msgArr = message.split(" ")
        let tag = msgArr.slice(1, msgArr.length - 2).join(" ").toLowerCase()
        let value = msgArr[msgArr.length - 1].replace('$', '')
        let isDeleted = await deleteRecurringPayment({ tag, value, type: 'recurring' })
        // updated existing month's recurring payment
        if (selected_category == defaults.recurring_this_month)
            updateRecurringExpense(parseFloat(value), false)
        let reply = isDeleted ? defaults.recurring_delete_success : defaults.recurring_delete_failure
        bot.sendMessage(chatId, reply, getDefaultOptions())
        selected_category = null
        state = null
    }
    // request summary
    if (isSummaryRequest(message)) {
        let sumReqObj = Object.values(summaries).filter(val => val.message == message)[0]
        // retrieve query date range
        const { start, end } = getDateRange(sumReqObj.tag)
        let scannedItems = await getExpenses(start, end)
        let resMsg = summaryMessageBuilder(scannedItems, start, end)
        let data = getDefaultOptions()
        // enable HTML parsing for text decorations
        data.parse_mode = 'HTML'
        bot.sendMessage(chatId, resMsg, data)
        state = null
    }
});

const getDefaultOptions = () => {
    var options = [defaults.expense, defaults.recurring, defaults.summary]
    var keyboard = genericKeyboardBuilder(options, 2, false)
    return { 'reply_markup': JSON.stringify(keyboard) }
}

const getOptions = (options, numCols) => {
    var keyboard = genericKeyboardBuilder(Object.values(options).map(val => val.message), numCols, true)
    return { 'reply_markup': JSON.stringify(keyboard) }
}

const getRecurringPaymentOptions = (payments, numCols) => {
    let options = []
    payments.forEach(item => {
        let message = `🔺 ${capitalize(item.tag)} - $${Math.round(item.value)}`
        options.push(message)
    })
    console.log(options)
    var keyboard = genericKeyboardBuilder(options, numCols, true)
    return { 'reply_markup': JSON.stringify(keyboard) }
}

const genericKeyboardBuilder = (options, numCol, hasBack) => {
    let keyboard = []
    let numRows = Math.ceil(parseFloat(options.length) / numCol)
    for (let i = 0; i < numRows; i++) {
        let row = []
        let start = i * numCol
        let end = (start + numCol + 1) > options.length ? options.length : (start + numCol)
        for (let j = start; j < end; j++) {
            row.push({ "text": options[j] })
        }
        keyboard.push(row)
    }
    if (hasBack) {
        keyboard.push([{ "text": defaults.back }])
    }
    return { keyboard }
}

const isAddRecurringInput = (text) => {
    text = text.trim()
    if (text.length < 2) {
        return false
    }
    var inputArr = text.split(" ")
    var name = inputArr.slice(0, inputArr.length - 1).join(" ")
    var amount = text[text.length - 1]
    if (isNaN(parseFloat(amount)) || !isNaN(name)) {
        return false
    }
    return true
}

const isSummaryRequest = (message) => {
    return Object.values(summaries).filter(val => val.message == message).length == 1
}


const getDateRange = (type) => {
    var end = new Date()
    var start = new Date()
    switch (type) {
        case summaries.last_week.tag:
            start = moment().startOf('week').subtract(7, 'days').format('YYYY-MM-DD')
            end = moment().endOf('week').subtract(7, 'days').format('YYYY-MM-DD')
            break;
        case summaries.current_week.tag:
            start = moment().startOf('week').format('YYYY-MM-DD')
            end = moment().endOf('week').format('YYYY-MM-DD')
            break;
        case summaries.last_month.tag:
            start = moment().subtract(1, 'months').startOf('month').format('YYYY-MM-DD')
            end = moment().subtract(1, 'months').endOf('month').format('YYYY-MM-DD')
            break;
        case summaries.current_month.tag:
            start = moment().startOf('month').format('YYYY-MM-DD')
            end = moment().endOf('month').format('YYYY-MM-DD')
            break;
        case summaries.last_year.tag:
            start = moment().subtract(1, 'years').startOf('year').format('YYYY-MM-DD')
            end = moment().subtract(1, 'years').endOf('year').format('YYYY-MM-DD')
            break;
        case summaries.current_year.tag:
            start = moment().startOf('year').format('YYYY-MM-DD')
            end = moment().endOf('year').format('YYYY-MM-DD')
            break;
        default:
            break;
    }
    console.log(`Start date: ${start} | End date: ${end}`)
    return { start, end }
}