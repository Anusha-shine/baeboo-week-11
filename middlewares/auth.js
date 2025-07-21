const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data && !data.isBlocked) {
                    next();
                } else {
                    res.redirect('/login');
                }
            })
            .catch(error => {
                console.log("Error in user auth middleware:", error);
                res.status(500).send("Internal Server Error");
            });
    } else {
        res.redirect('/login');
    }
};

const adminAuth = (req, res, next) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }

  User.findById(req.session.admin)
    .then(user => {
      if (user && user.isAdmin) {
        next();
      } else {
        res.redirect('/admin/login');
      }
    })
    .catch(err => {
      console.error('Error in adminAuth:', err);
      res.status(500).send('Internal Server Error');
    });
};



const isUserBlocked = async (req,res,next) => {
    try {
        if(req.session.user){
            const user = await User.findById(req.session.user);
            if(user && user.isBlocked){
                delete req.session.user;
                return res.redirect("/user/blocked");
            }
        }
        next();
    }catch(error){
     console.error("Error checking blocked user:",error);
     res.status(500).send("Server Error");
    }
}
module.exports = { userAuth,adminAuth,isUserBlocked};