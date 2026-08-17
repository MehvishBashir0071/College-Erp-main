import express from "express";
import auth from "../middleware/auth.js";
import rateLimit from "express-rate-limit";
import { validateRequest, addStudentSchema, addFacultySchema } from "../middleware/validation.js";
import { cacheMiddleware, clearCache } from "../middleware/cache.js";
import {
  adminLogin,
  updateAdmin,
  addAdmin,
  addFaculty,
  getFaculty,
  addSubject,
  getSubject,
  addStudent,
  getStudent,
  addDepartment,
  getAllStudent,
  getAllFaculty,
  getAllAdmin,
  getAllDepartment,
  getAllSubject,
  updatedPassword,
  getAdmin,
  deleteAdmin,
  deleteDepartment,
  deleteFaculty,
  deleteStudent,
  deleteSubject,
  createNotice,
  getNotice,
} from "../controller/adminController.js";

const router = express.Router();

// Define a rate limiter for login attempts (DDoS prevention)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: { message: "Too many login attempts, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware to invalidate Redis caches after a successful database modification
const invalidateCache = (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      clearCache("cache:*").catch((err) =>
        console.error("Error invalidating Redis cache on write:", err.message)
      );
    }
  });
  next();
};

// --- Read Routes (Cached) ---
router.get("/getallstudent", auth, cacheMiddleware(600), getAllStudent); // Cache for 10 mins
router.get("/getallfaculty", auth, cacheMiddleware(600), getAllFaculty);
router.get("/getalldepartment", auth, cacheMiddleware(3600), getAllDepartment); // Cache for 1 hour
router.get("/getallsubject", auth, cacheMiddleware(3600), getAllSubject);
router.get("/getalladmin", auth, cacheMiddleware(3600), getAllAdmin);
router.post("/getfaculty", auth, cacheMiddleware(600), getFaculty);
router.post("/getsubject", auth, cacheMiddleware(1800), getSubject);
router.post("/getstudent", auth, cacheMiddleware(600), getStudent);
router.post("/getnotice", auth, cacheMiddleware(600), getNotice);
router.post("/getadmin", auth, cacheMiddleware(3600), getAdmin);

// --- Login / Security Routes ---
router.post("/login", loginLimiter, adminLogin);
router.post("/updatepassword", auth, invalidateCache, updatedPassword);

// --- Write / Update Routes (Invalidates Caches) ---
router.post("/createnotice", auth, invalidateCache, createNotice);
router.post("/updateprofile", auth, invalidateCache, updateAdmin);
router.post("/addadmin", auth, invalidateCache, addAdmin);
router.post("/adddepartment", auth, invalidateCache, addDepartment);
router.post("/addfaculty", auth, validateRequest(addFacultySchema), invalidateCache, addFaculty);
router.post("/addsubject", auth, invalidateCache, addSubject);
router.post("/addstudent", auth, validateRequest(addStudentSchema), invalidateCache, addStudent);
router.post("/deleteadmin", auth, invalidateCache, deleteAdmin);
router.post("/deletefaculty", auth, invalidateCache, deleteFaculty);
router.post("/deletestudent", auth, invalidateCache, deleteStudent);
router.post("/deletedepartment", auth, invalidateCache, deleteDepartment);
router.post("/deletesubject", auth, invalidateCache, deleteSubject);

export default router;
