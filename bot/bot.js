const TelegramBot = require('node-telegram-bot-api');
const { categories, summaries, recurring, defaults } = require('./constants.json')
const { formatDate, getDateOfISOWeek, summaryMessageBuilder, recurringMessageBuilder, capitalize } = require('./helpers')
const { getAllRecurringPayments, deleteRecurringPayment, writeToTable, getExpenses } = require('./dbHandler')

require('dotenv').config()
const bot = new TelegramBot(process.env.TOKEN, { polling: true });
bot.on("polling_error", console.log);

/**
 * state --> keeps track of current position in decision tree
 * category --> keeps track of selected category if any
 */
let state = null
let selected_category = null

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

/**
 * recurring payments: add new recurring payment input prompt
 */
bot.onText(new RegExp(`${recurring.add.message}`), (msg, match) => {
    state = recurring.add.message
    bot.sendMessage(msg.chat.id, defaults.recurring_add_prompt)
})

/**
 * recurring payments: remove recurring payment selection prompt 
 */
bot.onText(new RegExp(`${recurring.delete.message}`), async (msg, match) => {
    state = recurring.delete.message
    let payments = await getAllRecurringPayments()
    bot.sendMessage(msg.chat.id, defaults.recurring_delete_prompt, getRecurringPaymentOptions(payments, 2))
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
    if (state == recurring.add.message && message != defaults.back) {
        let isValid = isAddRecurringInput(message)
        if (isValid) {
            let msgArr = message.split(" ")
            let tag = msgArr.slice(0, msgArr.length - 1).join(" ").toLowerCase()
            let value = msgArr[msgArr.length - 1]
            let isAdded = writeToTable({ tag, value, type: 'recurring' })
            let reply = isAdded ? defaults.recurring_add_success : defaults.recurring_add_failure
            bot.sendMessage(chatId, reply, getDefaultOptions())
        } else {
            bot.sendMessage(chatId, defaults.recurring_add_format_error, getDefaultOptions())
        }
        state = null
    }
    // remove selected recurring payment
    if (state == recurring.delete.message && message != defaults.back) {
        let msgArr = message.split(" ")
        let tag = msgArr.slice(1, msgArr.length - 2).join(" ").toLowerCase()
        let value = msgArr[msgArr.length - 1].replace('$', '')
        let isDeleted = await deleteRecurringPayment({ tag, value, type: 'recurring' })
        let reply = isDeleted ? defaults.recurring_delete_success : defaults.recurring_delete_failure
        bot.sendMessage(chatId, reply, getDefaultOptions())
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

/**
 * 
 * @param {string[]} options - array of string message options
 * @param {integer} numCol - number of options per row
 * @param {boolean} hasBack - set to true to include back button in returned keyboard
 * @returns 
 */
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
    var today = new Date()
    var end = formatDate(today)
    var start = end
    var oneJan = new Date(today.getFullYear(), 0, 1)
    var numberOfDays = Math.floor((today - oneJan) / (24 * 60 * 60 * 1000))
    var weekNumber = Math.ceil((today.getDay() + 1 + numberOfDays) / 7)
    switch (type) {
        case summaries.last_week.tag:
            var date = getDateOfISOWeek(weekNumber - 1, today.getFullYear())
            start = formatDate(date)
            date.setDate(date.getDate() + 6)
            end = formatDate(date)
            break;
        case summaries.current_week.tag:
            var date = getDateOfISOWeek(weekNumber, today.getFullYear())
            start = formatDate(date)
            date.setDate(date.getDate() + 6)
            end = formatDate(date)
            break;
        case summaries.last_month.tag:
            start = formatDate(new Date(today.getFullYear(), today.getMonth() - 1, 1))
            end = formatDate(new Date(today.getFullYear(), today.getMonth(), 0));
            break;
        case summaries.current_month.tag:
            start = formatDate(new Date(today.getFullYear(), today.getMonth(), 1))
            end = formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
            break;
        case summaries.last_year.tag:
            start = formatDate(new Date(today.getFullYear() - 1, 0, 1));
            end = formatDate(new Date(today.getFullYear() - 1, 12, 0));
            break;
        case summaries.current_year.tag:
            start = formatDate(new Date(today.getFullYear(), 0, 1));
            end = formatDate(new Date(today.getFullYear(), 12, 0));
            break;
        default:
            break;
    }
    return { start, end }
}