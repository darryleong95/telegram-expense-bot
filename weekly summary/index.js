require('dotenv').config()

const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment')
moment.updateLocale('en', {
    week: {
        dow: 1, // Monday is the first day of the week.
    }
});
const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.REGION });
const ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
const bot = new TelegramBot(process.env.TOKEN, { polling: true });
const chatId = process.env.CHAT_ID
const categories = ["food", "bills", "transport", "gifts", "clothes", "others"]

exports.handler = async (event) => {
    var cwStart = moment().startOf('week').format('YYYY-MM-DD')
    var cwEnd = moment().endOf('week').format('YYYY-MM-DD')

    var pwStart = moment().startOf('week').subtract(7, 'days').format('YYYY-MM-DD')
    var pwEnd = moment().endOf('week').subtract(7, 'days').format('YYYY-MM-DD')

    console.log(`current week: ${cwStart} => ${cwEnd} | prev week: ${pwStart} => ${pwEnd}`)

    var currExp = await getExpenses(cwStart, cwEnd)
    var prevExp = await getExpenses(pwStart, pwEnd)

    // populate with existing tags
    var ced = {}
    var ped = {}
    categories.forEach(c => {
        ced[c] = 0
        ped[c] = 0
    })
    currExp.forEach(exp => {
        ced[exp.tag] += parseFloat(exp.value)
    })
    prevExp.forEach(exp => {
        ped[exp.tag] += parseFloat(exp.value)
    })

    var sm = {}
    var currTotal = 0
    var prevTotal = 0
    for (const tag in ced) {
        var cVal = parseFloat(ced[tag])
        var pVal = parseFloat(ped[tag])
        var direction = ''
        var change = 'n/a'
        if (cVal != 0 && pVal != 0) {
            var wowChange = Math.round(((cVal - pVal) / pVal) * 100)
            direction = wowChange < 0 ? '🔻' : '🔺️'
            change = Math.abs(wowChange) + "%"
        }

        currTotal += parseFloat(ced[tag])
        prevTotal += parseFloat(ped[tag])
        sm[tag] = {
            value: round2Dp(cVal),
            direction,
            change
        }
    }

    var direction = '-'
    var wowChange = ''

    if (prevTotal != 0 && currTotal != 0) {
        direction = prevTotal < currTotal ? '🔼' : '🔽'
        wowChange = Math.abs(round2Dp(((currTotal - prevTotal) / prevTotal) * 100))
    }

    let message = `<b>Expense Summary</b>`
        + `\n==============================`
        + `\n<b>📅 ${cwStart} ---> ${cwEnd}</b>`
        + `\n==============================`
        + `\n🥘 Food: <b>$${sm.food.value}</b> (${sm.food.direction}${sm.food.change})`
        + `\n🚌 Transport: <b>$${sm.transport.value}</b> (${sm.transport.direction}${sm.transport.change})`
        + `\n💸 Bills: <b>$${sm.bills.value}</b> (${sm.bills.direction}${sm.bills.change})`
        + `\n👕 Clothes: <b>$${sm.clothes.value}</b> (${sm.clothes.direction}${sm.clothes.change})`
        + `\n🎁 Gifts: <b>$${sm.gifts.value}</b> (${sm.gifts.direction}${sm.gifts.change})`
        + `\n🤯 Others: <b>$${sm.others.value}</b> (${sm.others.direction}${sm.others.change})`
        + `\n==============================`
        + `\n${direction}${wowChange}% from last week`

    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' })
}

const round2Dp = (num) => {
    return Math.round((num + Number.EPSILON) * 100) / 100
}

const getExpenses = async (start, end) => {
    let params = {
        TableName: process.env.TABLE_NAME,
        FilterExpression: "category = :category and insert_date between :start and :end",
        ExpressionAttributeValues: {
            ":category": {
                "S": 'expense'
            },
            ":start": {
                "S": start
            },
            ":end": {
                "S": end
            }
        }
    }
    return await scan(params)
}

const scan = async (params) => {
    let scannedItems = []
    const scanPromise = ddb.scan(params).promise().then(data => {
        data.Items.forEach(function (e, index, array) {
            let item = {
                tag: e.tag.S,
                value: e.value.N,
                id: e.id.S
            }
            scannedItems.push(item)
        });
    })
    await Promise.all([scanPromise])
    return scannedItems
}