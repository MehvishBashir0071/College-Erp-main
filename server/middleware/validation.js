import Joi from "joi";

// 1. Reusable validation middleware helper
export const validateRequest = (schema) => {
  return (req, res, next) => {
    // Run the schema validation against the request body
    const { error } = schema.validate(req.body, { abortEarly: false });

    // If there is an error, collect all validation details and return a 400 Bad Request
    if (error) {
      const errorMessage = error.details.map((detail) => detail.message).join(", ");
      return res.status(400).json({ message: errorMessage });
    }

    // Proceed to the next controller if validation passes
    next();
  };
};

// 2. Student Creation Schema
export const addStudentSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  dob: Joi.string().required(),
  department: Joi.string().required(),
  contactNumber: Joi.string().pattern(/^[0-9]{10}$/).allow(""),
  avatar: Joi.string().allow(""),
  gender: Joi.string().valid("Male", "Female", "Other", "").optional(),
  batch: Joi.string().optional(),
  fatherName: Joi.string().allow(""),
  motherName: Joi.string().allow(""),
  fatherContactNumber: Joi.string().pattern(/^[0-9]{10}$/).allow(""),
  motherContactNumber: Joi.string().pattern(/^[0-9]{10}$/).allow(""),
  section: Joi.string().max(2).required(),
  year: Joi.number().integer().min(1).max(5).required()
});

// 3. Faculty Creation Schema
export const addFacultySchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  dob: Joi.string().required(),
  department: Joi.string().required(),
  contactNumber: Joi.string().pattern(/^[0-9]{10}$/).allow(""),
  avatar: Joi.string().allow(""),
  joiningYear: Joi.number().integer().min(1900).max(2100).required(),
  gender: Joi.string().valid("Male", "Female", "Other", "").optional(),
  designation: Joi.string().required()
});
