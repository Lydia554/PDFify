const checkSubscription = (req, res, next) => {
    
    if (!req.user) {
      return res.status(403).json({ error: "User not authenticated" });
    }
  
 
    if (!req.user.isPremium) {
      return res.status(403).json({ error: "Access restricted to premium users" });
    }
  
    
    next();
  };
  
  module.exports = checkSubscription;