const User = require('../models/userSchema');
 require('mongoose');

const userAuth = async (req, res, next) => {
  try {
    if (req.session.user) {
      const user = await User.findById(req.session.user);
      if (user) {
        if (user.isBlocked) {
          delete req.session.user;
          return res.redirect('/user/blocked');
        }
        return next();
      }
    }
    return res.redirect('/login');
  } catch (error) {
    console.error("Error in userAuth middleware:", error);
    res.status(500).send("Internal Server Error");
  }
};

const adminAuth = (req, res, next) => {
  if (!req.session.admin) {
    if (req.xhr || req.headers.accept.includes('application/json')) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    return res.redirect('/admin/login');
  }

  User.findById(req.session.admin)
    .then(user => {
      if (user && user.isAdmin) {
        next();
      } else {
        if (req.xhr || req.headers.accept.includes('application/json')) {
          return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        res.redirect('/admin/login');
      }
    })
    .catch(err => {
      console.error('Error in adminAuth:', err);
      res.status(500).send('Internal Server Error');
    });
};

module.exports = { userAuth, adminAuth };
