const ReferralCode = require('../models/referralCodeSchema');
const generateReferralCode = require('../helpers/referralGenerate');

const createReferralForUser = async (user) => {
  const code = generateReferralCode();
  const referralLink = `https://yourdomain.com/signup?ref=${code}`;

  const referral = new ReferralCode({
    user: user._id,
    code,
    referralLink,
    rewardAmount: 100
  });

  await referral.save();
  return referral;
};

module.exports = {
  createReferralForUser
};