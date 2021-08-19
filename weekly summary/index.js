const TelegramBot = require('node-telegram-bot-api');
const AWS = require('aws-sdk');
require('dotenv').config()

AWS.config.update({ region: 'ap-southeast-1' });
var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
const bot = new TelegramBot(process.env.TOKEN, { polling: true });
const chatId = process.env.CHAT_ID


exports.handler = async (event) => {
    var cStart = new Date()
    cStart.setDate(cStart.getDate() - 7)

    var cEnd = new Date()
    cEnd.setDate(cEnd.getDate() - 1)

    var pStart = new Date()
    pStart.setDate(pStart.getDate() - 14)

    var pEnd = new Date()
    pEnd.setDate(pEnd.getDate() - 8)

    console.log(`current week: ${cStart.toDateString()} => ${cEnd.toDateString()} | prev week: ${pStart.toDateString()} => ${pEnd.toDateString()}`)

    var cExpenses = await getExpenses(formatDate(cStart), formatDate(cEnd))
    var pExpenses = await getExpenses(formatDate(pStart), formatDate(pEnd))

    // populate with existing tags
    var ced = {}
    var ped = {}
    var tags = await getTags()
    for (let cat of tags) {
        ced[cat.tag] = 0
        ped[cat.tag] = 0
    }

    for (let expense of cExpenses)
        ced[expense.tag] = expense.value
    for (let expense of pExpenses)
        ped[expense.tag] = expense.value

    var sm = {}
    var cTotal = 0
    var pTotal = 0
    for (const tag in ced) {
        var cVal = parseFloat(ced[tag])
        var pVal = parseFloat(ped[tag])
        var percentChange = Math.round(((cVal - pVal) / pVal) * 100)
        var direction = isNaN(percentChange) ? '' : percentChange < 0 ? '🔻' : '🔺️'
        var change = isNaN(percentChange) ? 'n/a' : Math.abs(percentChange)
        cTotal += parseFloat(ced[tag])
        pTotal += parseFloat(ped[tag])
        sm[tag] = {
            value: round2Dp(cVal),
            direction,
            change
        }
    }
    var directionChange = (pTotal < cTotal) ? '🔼' : pTotal == cTotal ? 'n/a' : '🔽'
    var absChange = Math.round(((cTotal - pTotal) / pTotal) * 100)
    absChange = isNaN(absChange) ? '' : absChange

    let message = `<b>Expense Summary</b>`
        + `\n==============================`
        + `\n<b>📅 ${formatDate(cStart)} ---> ${formatDate(cEnd)}</b>`
        + `\n==============================`
        + `\n🥘 Food: <b>$${sm.food.value}</b> -- ${sm.food.direction}${sm.food.change}%`
        + `\n🚌 Transport: <b>$${sm.transport.value}</b> -- ${sm.transport.direction}${sm.transport.change}%`
        + `\n💸 Bills: <b>$${sm.bills.value}</b> -- ${sm.bills.direction}${sm.bills.change}%`
        + `\n👕 Clothes: <b>$${sm.clothes.value}</b> -- ${sm.clothes.direction}${sm.clothes.change}%`
        + `\n🎁 Gifts: <b>$${sm.gifts.value}</b> -- ${sm.gifts.direction}${sm.gifts.change}%`
        + `\n🤯 Others: <b>$${sm.others.value}</b> -- ${sm.others.direction}${sm.others.change}%`
        + `\n♾️ Recurring: <b>$${sm.recurring.value}</b> -- ${sm.recurring.direction}${sm.recurring.change}%`
        + `\n==============================`
        + `\n${directionChange}${absChange}% from last week`

    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' })
}

const round2Dp = (num) => {
    return Math.round((num + Number.EPSILON) * 100) / 100
}

const getTags = async () => {
    let params = {
        TableName: 'expense-table',
        FilterExpression: "category = :category",
        ExpressionAttributeValues: {
            ":category": {
                "S": 'tag'
            }
        }
    }
    return await scan(params)
}

const getExpenses = async (start_date, end_date) => {
    let params = {
        TableName: 'expense-table',
        FilterExpression: "category = :category and insert_date between :start_date and :end_date",
        ExpressionAttributeValues: {
            ":category": {
                "S": 'expense'
            },
            ":start_date": {
                "S": start_date
            },
            ":end_date": {
                "S": end_date
            }
        }
    }
    return await scan(params)
}

const scan = async (params) => {
    // Create a bot that uses 'polling' to fetch new updates
    let scannedItems = []
    const scanPromise = ddb.scan(params).promise().then(data => {
        data.Items.forEach(function (e, index, array) {
            let item = {
                tag: e.tag.S,
                value: e.value.S,
                id: e.id.S
            }
            scannedItems.push(item)
        });
    })
    await Promise.all([scanPromise])
    return scannedItems
}

const formatDate = (date) => {
    let month = date.getMonth() + 1
    let day = date.getDate()
    if (date.getMonth() + 1 < 10) {
        month = '0' + (date.getMonth() + 1)
    }
    if (date.getDate() < 10) {
        day = '0' + date.getDate()
    }
    return date.getFullYear() + '-' + month + '-' + day;
}