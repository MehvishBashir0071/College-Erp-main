import jwt from "jsonwebtoken";

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization.split(" ")[1];
    let decodedData;
    if (token) {
      decodedData = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decodedData?.id;
    }
    next();
  } catch (error) {
    console.log("Auth Middleware Error:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export default auth;
