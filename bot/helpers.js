const { categories } = require('./constants.json')
const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

module.exports.formatDate = (date) => {
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

module.exports.getDateOfISOWeek = (w, y) => {
    var simple = new Date(y, 0, 1 + (w - 1) * 7);
    var dow = simple.getDay();
    var ISOweekStart = simple;
    if (dow <= 4)
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return ISOweekStart
}

module.exports.summaryMessageBuilder = (found_items, startDate, endDate) => {
    // return string
    sda = startDate.split("-")
    startDate = sda[2] + ' ' + months[parseInt(sda[1])] + ' ' + sda[0]

    eda = endDate.split("-")
    endDate = eda[2] + ' ' + months[parseInt(eda[1])] + ' ' + eda[0]

    // pop map
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
        total += parseFloat(item.value)
    }

    let message = `<b>Expense Summary</b>`
        + `\n==============================`
        + `\n<b>📅 ${startDate} ---> ${endDate}</b>`
        + `\n==============================`
        + `\n💰 Total: <b>$${Math.round(total)}</b>`
        + `\n🥘 Food: <b>$${cm.food}</b> (${calculatePercentage(cm.food, total)})`
        + `\n🚌 Transport: <b>$${cm.transport}</b> (${calculatePercentage(cm.transport, total)})`
        + `\n💸 Bills: <b>$${cm.bills}</b> (${calculatePercentage(cm.bills, total)})`
        + `\n👕 Clothes: <b>$${cm.clothes}</b> (${calculatePercentage(cm.clothes, total)})`
        + `\n🎁 Gifts: <b>$${cm.gifts}</b> (${calculatePercentage(cm.gifts, total)})`
        + `\n🤯 Others: <b>$${cm.others}</b> (${calculatePercentage(cm.others, total)})`
    return message
}

module.exports.recurringMessageBuilder = (items) => {
    let message = '<b>Recurring Payments</b>'
        + "\n=============================="
    for (let item of items) {
        let tag = item.tag
        let value = item.value
        message += `\n🚩 ${capitalize(tag)} .............. $${Math.round(value)}`
    }
    return message
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

