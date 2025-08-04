const ejs = require("ejs");
const path = require("path");

const renderPartial = (view, data) => {
    return new Promise((resolve, reject) => {
        ejs.renderFile(path.join(__dirname, "..", "views", ${view}.ejs), data, (err, str) => {
            if (err) return reject(err);
            resolve(str);
        });
    });
};

module.exports = renderPartial;