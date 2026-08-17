import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../config/prisma.js";
import { uploadImage } from "../services/s3Service.js";
import { publishEvent } from "../services/kafka.js";

// Helper to serialize BigInt fields to String to prevent JSON parse crashes in Express responses
const serialize = (data) => {
  return JSON.parse(
    JSON.stringify(data, (key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
};

export const adminLogin = async (req, res) => {
  const { username, password } = req.body;
  const errors = { usernameError: "", passwordError: "" };
  try {
    const existingAdmin = await prisma.admin.findUnique({
      where: { username }
    });
    
    if (!existingAdmin) {
      errors.usernameError = "Admin doesn't exist.";
      return res.status(404).json(errors);
    }
    const isPasswordCorrect = await bcrypt.compare(
      password,
      existingAdmin.password
    );
    if (!isPasswordCorrect) {
      errors.passwordError = "Invalid Credentials";
      return res.status(404).json(errors);
    }

    const token = jwt.sign(
      {
        email: existingAdmin.email,
        id: existingAdmin.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({ result: serialize(existingAdmin), token });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

export const updatedPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword, email } = req.body;
    const errors = { mismatchError: "" };
    if (newPassword !== confirmPassword) {
      errors.mismatchError = "Your password and confirmation password do not match";
      return res.status(400).json(errors);
    }

    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedAdmin = await prisma.admin.update({
      where: { email },
      data: {
        password: hashedPassword,
        passwordUpdated: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
      response: serialize(updatedAdmin),
    });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const updateAdmin = async (req, res) => {
  try {
    const { name, dob, department, contactNumber, avatar, email } = req.body;
    const avatarUrl = avatar ? await uploadImage(avatar) : undefined;

    const updatedAdmin = await prisma.admin.update({
      where: { email },
      data: {
        name: name || undefined,
        dob: dob || undefined,
        department: department || undefined,
        contactNumber: contactNumber ? BigInt(contactNumber) : undefined,
        avatar: avatarUrl,
      },
    });

    res.status(200).json(serialize(updatedAdmin));
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const addAdmin = async (req, res) => {
  try {
    const { name, dob, department, contactNumber, avatar, email, joiningYear } = req.body;
    const errors = { emailError: "" };
    
    const existingAdmin = await prisma.admin.findUnique({ where: { email } });
    if (existingAdmin) {
      errors.emailError = "Email already exists";
      return res.status(400).json(errors);
    }
    
    const existingDepartment = await prisma.department.findUnique({ where: { department } });
    if (!existingDepartment) {
      return res.status(400).json({ message: "Department does not exist" });
    }
    let departmentHelper = existingDepartment.departmentCode;
    const admins = await prisma.admin.findMany({ where: { department } });

    let helper;
    if (admins.length < 10) {
      helper = "00" + admins.length.toString();
    } else if (admins.length < 100 && admins.length > 9) {
      helper = "0" + admins.length.toString();
    } else {
      helper = admins.length.toString();
    }
    const date = new Date();
    const components = ["ADM", date.getFullYear(), departmentHelper, helper];
    const username = components.join("");
    
    const newDob = dob.split("-").reverse().join("-");
    const hashedPassword = await bcrypt.hash(newDob, 10);
    const passwordUpdated = false;

    const avatarUrl = avatar ? await uploadImage(avatar) : null;

    const newAdmin = await prisma.admin.create({
      data: {
        name,
        email,
        password: hashedPassword,
        joiningYear: joiningYear ? joiningYear.toString() : null,
        username,
        department,
        avatar: avatarUrl,
        contactNumber: contactNumber ? BigInt(contactNumber) : null,
        dob,
        passwordUpdated,
      }
    });

    return res.status(200).json({
      success: true,
      message: "Admin registered successfully",
      response: serialize(newAdmin),
    });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const addDummyAdmin = async () => {
  const email = "dummy@gmail.com";
  const password = "123";
  const name = "dummy";
  const username = "ADMDUMMY";
  const hashedPassword = await bcrypt.hash(password, 10);
  const passwordUpdated = true;

  try {
    const dummyAdmin = await prisma.admin.findUnique({ where: { email } });

    if (!dummyAdmin) {
      await prisma.admin.create({
        data: {
          name,
          email,
          password: hashedPassword,
          username,
          passwordUpdated,
        }
      });
      console.log("Dummy user added.");
    } else {
      console.log("Dummy user already exists.");
    }
  } catch (error) {
    console.log("Error adding dummy admin:", error.message);
  }
};

export const createNotice = async (req, res) => {
  try {
    const { from, content, topic, date, noticeFor } = req.body;
    const errors = { noticeError: "" };
    
    const existingNotice = await prisma.notice.findFirst({
      where: { topic, content, date }
    });
    
    if (existingNotice) {
      errors.noticeError = "Notice already created";
      return res.status(400).json(errors);
    }
    
    const newNotice = await prisma.notice.create({
      data: {
        from,
        content,
        topic,
        noticeFor,
        date,
      }
    });

    // Publish a background worker event to alert students about the new notice asynchronously
    await publishEvent("college-erp-alerts", {
      type: "NOTICE_CREATED",
      data: {
        topic: newNotice.topic,
        noticeFor: newNotice.noticeFor,
      },
    });
    
    return res.status(200).json({
      success: true,
      message: "Notice created successfully",
      response: newNotice,
    });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const addDepartment = async (req, res) => {
  try {
    const errors = { departmentError: "" };
    const { department } = req.body;
    const existingDepartment = await prisma.department.findUnique({ where: { department } });
    if (existingDepartment) {
      errors.departmentError = "Department already added";
      return res.status(400).json(errors);
    }
    const departments = await prisma.department.findMany({});
    let add = departments.length + 1;
    let departmentCode;
    if (add < 9) {
      departmentCode = "0" + add.toString();
    } else {
      departmentCode = add.toString();
    }

    const newDepartment = await prisma.department.create({
      data: {
        department,
        departmentCode,
      }
    });

    return res.status(200).json({
      success: true,
      message: "Department added successfully",
      response: newDepartment,
    });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const addFaculty = async (req, res) => {
  try {
    const {
      name,
      dob,
      department,
      contactNumber,
      avatar,
      email,
      joiningYear,
      gender,
      designation,
    } = req.body;
    const errors = { emailError: "" };
    
    const existingFaculty = await prisma.faculty.findUnique({ where: { email } });
    if (existingFaculty) {
      errors.emailError = "Email already exists";
      return res.status(400).json(errors);
    }
    const existingDepartment = await prisma.department.findUnique({ where: { department } });
    if (!existingDepartment) {
      return res.status(400).json({ message: "Department does not exist" });
    }
    let departmentHelper = existingDepartment.departmentCode;

    const faculties = await prisma.faculty.findMany({ where: { department } });
    let helper;
    if (faculties.length < 10) {
      helper = "00" + faculties.length.toString();
    } else if (faculties.length < 100 && faculties.length > 9) {
      helper = "0" + faculties.length.toString();
    } else {
      helper = faculties.length.toString();
    }
    const date = new Date();
    const components = ["FAC", date.getFullYear(), departmentHelper, helper];
    const username = components.join("");
    
    const newDob = dob.split("-").reverse().join("-");
    const hashedPassword = await bcrypt.hash(newDob, 10);
    const passwordUpdated = false;

    const avatarUrl = avatar ? await uploadImage(avatar) : null;

    const newFaculty = await prisma.faculty.create({
      data: {
        name,
        email,
        password: hashedPassword,
        joiningYear: parseInt(joiningYear),
        username,
        department,
        avatar: avatarUrl,
        contactNumber: contactNumber ? BigInt(contactNumber) : null,
        dob,
        gender,
        designation,
        passwordUpdated,
      }
    });

    return res.status(200).json({
      success: true,
      message: "Faculty registered successfully",
      response: serialize(newFaculty),
    });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const getFaculty = async (req, res) => {
  try {
    const { department } = req.body;
    const errors = { noFacultyError: "" };
    const faculties = await prisma.faculty.findMany({ where: { department } });
    if (faculties.length === 0) {
      errors.noFacultyError = "No Faculty Found";
      return res.status(404).json(errors);
    }
    res.status(200).json({ result: serialize(faculties) });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const getNotice = async (req, res) => {
  try {
    const errors = { noNoticeError: "" };
    const notices = await prisma.notice.findMany({});
    if (notices.length === 0) {
      errors.noNoticeError = "No Notice Found";
      return res.status(404).json(errors);
    }
    res.status(200).json({ result: notices });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const addSubject = async (req, res) => {
  try {
    const { totalLectures, department, subjectCode, subjectName, year } = req.body;
    const errors = { subjectError: "" };
    
    const subject = await prisma.subject.findUnique({ where: { subjectCode } });
    if (subject) {
      errors.subjectError = "Given Subject is already added";
      return res.status(400).json(errors);
    }

    const students = await prisma.student.findMany({
      where: { department, year: parseInt(year) }
    });

    const newSubject = await prisma.subject.create({
      data: {
        totalLectures: parseInt(totalLectures) || 10,
        department,
        subjectCode,
        subjectName,
        year: year.toString(),
        students: {
          connect: students.map(s => ({ id: s.id }))
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: "Subject added successfully",
      response: serialize(newSubject),
    });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const getSubject = async (req, res) => {
  try {
    const { department, year } = req.body;
    const errors = { noSubjectError: "" };

    const subjects = await prisma.subject.findMany({
      where: { department, year: year.toString() }
    });
    
    if (subjects.length === 0) {
      errors.noSubjectError = "No Subject Found";
      return res.status(404).json(errors);
    }
    res.status(200).json({ result: serialize(subjects) });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const getAdmin = async (req, res) => {
  try {
    const { department } = req.body;
    const errors = { noAdminError: "" };

    const admins = await prisma.admin.findMany({ where: { department } });
    if (admins.length === 0) {
      errors.noAdminError = "No Admin Found";
      return res.status(404).json(errors);
    }
    res.status(200).json({ result: serialize(admins) });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

// Optimised to delete multiple records in a single SQL operation instead of loop-queries
export const deleteAdmin = async (req, res) => {
  try {
    const admins = req.body; // Array of IDs
    await prisma.admin.deleteMany({
      where: {
        id: { in: admins.map(id => parseInt(id)) }
      }
    });
    res.status(200).json({ message: "Admin Deleted" });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const deleteFaculty = async (req, res) => {
  try {
    const faculties = req.body;
    await prisma.faculty.deleteMany({
      where: {
        id: { in: faculties.map(id => parseInt(id)) }
      }
    });
    res.status(200).json({ message: "Faculty Deleted" });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const students = req.body;
    await prisma.student.deleteMany({
      where: {
        id: { in: students.map(id => parseInt(id)) }
      }
    });
    res.status(200).json({ message: "Student Deleted" });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const deleteSubject = async (req, res) => {
  try {
    const subjects = req.body;
    await prisma.subject.deleteMany({
      where: {
        id: { in: subjects.map(id => parseInt(id)) }
      }
    });
    res.status(200).json({ message: "Subject Deleted" });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const deleteDepartment = async (req, res) => {
  try {
    const { department } = req.body;
    await prisma.department.deleteMany({
      where: { department }
    });
    res.status(200).json({ message: "Department Deleted" });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const addStudent = async (req, res) => {
  try {
    const {
      name,
      dob,
      department,
      contactNumber,
      avatar,
      email,
      section,
      gender,
      batch,
      fatherName,
      motherName,
      fatherContactNumber,
      motherContactNumber,
      year,
    } = req.body;
    const errors = { emailError: "" };
    
    const existingStudent = await prisma.student.findUnique({ where: { email } });
    if (existingStudent) {
      errors.emailError = "Email already exists";
      return res.status(400).json(errors);
    }
    const existingDepartment = await prisma.department.findUnique({ where: { department } });
    if (!existingDepartment) {
      return res.status(400).json({ message: "Department does not exist" });
    }
    let departmentHelper = existingDepartment.departmentCode;

    const students = await prisma.student.findMany({ where: { department } });
    let helper;
    if (students.length < 10) {
      helper = "00" + students.length.toString();
    } else if (students.length < 100 && students.length > 9) {
      helper = "0" + students.length.toString();
    } else {
      helper = students.length.toString();
    }
    const date = new Date();
    const components = ["STU", date.getFullYear(), departmentHelper, helper];
    const username = components.join("");
    
    const newDob = dob.split("-").reverse().join("-");
    const hashedPassword = await bcrypt.hash(newDob, 10);
    const passwordUpdated = false;

    // Find all subjects matching the student's department and year
    const subjects = await prisma.subject.findMany({
      where: { department, year: year.toString() }
    });

    const avatarUrl = avatar ? await uploadImage(avatar) : null;

    const newStudent = await prisma.student.create({
      data: {
        name,
        dob,
        password: hashedPassword,
        username,
        department,
        contactNumber: contactNumber ? BigInt(contactNumber) : null,
        avatar: avatarUrl,
        email,
        section,
        gender,
        batch,
        fatherName,
        motherName,
        fatherContactNumber: fatherContactNumber ? BigInt(fatherContactNumber) : null,
        motherContactNumber: motherContactNumber ? BigInt(motherContactNumber) : null,
        year: parseInt(year),
        passwordUpdated,
        // Establish clean relational connect with subjects automatically in a single query
        subjects: {
          connect: subjects.map(s => ({ id: s.id }))
        }
      }
    });

    // Publish a background worker event to send credentials/welcome email asynchronously
    await publishEvent("college-erp-alerts", {
      type: "STUDENT_REGISTERED",
      data: {
        email: newStudent.email,
        username: newStudent.username,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Student registered successfully",
      response: serialize(newStudent),
    });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const getStudent = async (req, res) => {
  try {
    const { department, year } = req.body;
    const errors = { noStudentError: "" };
    
    const students = await prisma.student.findMany({
      where: { department, year: parseInt(year) }
    });

    if (students.length === 0) {
      errors.noStudentError = "No Student Found";
      return res.status(404).json(errors);
    }

    res.status(200).json({ result: serialize(students) });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const getAllStudent = async (req, res) => {
  try {
    const students = await prisma.student.findMany({});
    res.status(200).json(serialize(students));
  } catch (error) {
    console.log("Backend Error", error);
    res.status(500).json({ message: error.message });
  }
};

export const getAllFaculty = async (req, res) => {
  try {
    const faculties = await prisma.faculty.findMany({});
    res.status(200).json(serialize(faculties));
  } catch (error) {
    console.log("Backend Error", error);
    res.status(500).json({ message: error.message });
  }
};

export const getAllAdmin = async (req, res) => {
  try {
    const admins = await prisma.admin.findMany({});
    res.status(200).json(serialize(admins));
  } catch (error) {
    console.log("Backend Error", error);
    res.status(500).json({ message: error.message });
  }
};

export const getAllDepartment = async (req, res) => {
  try {
    const departments = await prisma.department.findMany({});
    res.status(200).json(departments);
  } catch (error) {
    console.log("Backend Error", error);
    res.status(500).json({ message: error.message });
  }
};

export const getAllSubject = async (req, res) => {
  try {
    const subjects = await prisma.subject.findMany({});
    res.status(200).json(serialize(subjects));
  } catch (error) {
    console.log("Backend Error", error);
    res.status(500).json({ message: error.message });
  }
};
