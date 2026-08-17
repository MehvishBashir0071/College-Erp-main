import jwt from "jsonwebtoken";

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // 1. Check if the Authorization header exists and starts with "Bearer "
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access denied. No token provided." });
    }

    // 2. Extract the token
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Access denied. Token is empty." });
    }

    // 3. Verify the token
    const decodedData = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decodedData?.id;
    
    // 4. Ensure the token contains a valid user ID
    if (!req.userId) {
      return res.status(401).json({ message: "Access denied. Invalid token structure." });
    }

    next();
  } catch (error) {
    console.log("Auth Middleware Error:", error.message);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

export default auth;

