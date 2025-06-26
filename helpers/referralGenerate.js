const crypto = require('crypto');

function generateReferralCode(length = 8) {
    return crypto.randomBytes(length).toString('hex').slice(0, length).toLocaleUpperCase();
} 

module.exports = {generateReferralCode};