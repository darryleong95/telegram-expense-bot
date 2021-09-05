const { categories } = require('./constants.json')
const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

module.exports.summaryMessageBuilder = (found_items, startDate, endDate) => {
    // return string
    sda = startDate.split("-")
    startDate = sda[2] + ' ' + months[parseInt(sda[1])] + ' ' + sda[0]

    eda = endDate.split("-")
    endDate = eda[2] + ' ' + months[parseInt(eda[1])] + ' ' + eda[0]

    cm = {}
    Object.keys(categories).forEach((key) => {
        cm[key] = 0;
    });

    let total = 0
    for (let item of found_items) {
        if (item.tag in cm)
            cm[item.tag] += parseFloat(item.value)
        else
            cm[item.tag] = parseFloat(item.value)

        if(item.tag != 'recurring')
            total += parseFloat(item.value)
    }

    let message = `<b>Expense Summary</b>`
        + `\n==============================`
        + `\n<b>📅 ${startDate} ---> ${endDate}</b>`
        + `\n==============================`
        + `\n💰 Total: <b>$${Math.round(total)}</b>`
        + `\n🥘 Food: <b>$${roundTwoDp(cm.food)}</b> (${calculatePercentage(cm.food, total)})`
        + `\n🚌 Transport: <b>$${roundTwoDp(cm.transport)}</b> (${calculatePercentage(cm.transport, total)})`
        + `\n💸 Bills: <b>$${roundTwoDp(cm.bills)}</b> (${calculatePercentage(cm.bills, total)})`
        + `\n👕 Clothes: <b>$${roundTwoDp(cm.clothes)}</b> (${calculatePercentage(cm.clothes, total)})`
        + `\n🎁 Gifts: <b>$${roundTwoDp(cm.gifts)}</b> (${calculatePercentage(cm.gifts, total)})`
        + `\n🤯 Others: <b>$${roundTwoDp(cm.others)}</b> (${calculatePercentage(cm.others, total)})`
    return message
}

module.exports.recurringMessageBuilder = (items) => {
    let message = '<b>Recurring Payments</b>'
        + "\n=============================="
    if(items.length == 0){
        message += "\nCurrently no Recurring payments registered"
    }
    for (let item of items) {
        let tag = item.tag
        let value = item.value
        message += `\n🚩 ${capitalize(tag)} .............. $${Math.round(value)}`
    }
    return message
}

const roundTwoDp = (num) => {
    return Math.round((num + Number.EPSILON) * 100) / 100
}

const capitalize = module.exports.capitalize = (word) => {
    const lower = word.toLowerCase();
    return word.charAt(0).toUpperCase() + lower.slice(1);
}

const calculatePercentage = (n, d) => {
    if (n == 0 || d == 0)
        return '-'
    return Math.round((n / d) * 100) + '%'
}

