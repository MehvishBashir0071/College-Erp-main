import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../config/prisma.js";
import { uploadImage } from "../services/s3Service.js";

// Helper to serialize BigInt fields to String to prevent JSON parse crashes in Express responses
const serialize = (data) => {
  return JSON.parse(
    JSON.stringify(data, (key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
};

export const facultyLogin = async (req, res) => {
  const { username, password } = req.body;
  const errors = { usernameError: "", passwordError: "" };
  try {
    const existingFaculty = await prisma.faculty.findUnique({
      where: { username }
    });
    if (!existingFaculty) {
      errors.usernameError = "Faculty doesn't exist.";
      return res.status(404).json(errors);
    }
    const isPasswordCorrect = await bcrypt.compare(
      password,
      existingFaculty.password
    );
    if (!isPasswordCorrect) {
      errors.passwordError = "Invalid Credentials";
      return res.status(404).json(errors);
    }

    const token = jwt.sign(
      {
        email: existingFaculty.email,
        id: existingFaculty.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({ result: serialize(existingFaculty), token });
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

    const faculty = await prisma.faculty.findUnique({ where: { email } });
    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedFaculty = await prisma.faculty.update({
      where: { email },
      data: {
        password: hashedPassword,
        passwordUpdated: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
      response: serialize(updatedFaculty),
    });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const updateFaculty = async (req, res) => {
  try {
    const { name, dob, department, contactNumber, avatar, email, designation } = req.body;
    const avatarUrl = avatar ? await uploadImage(avatar) : undefined;

    const updatedFaculty = await prisma.faculty.update({
      where: { email },
      data: {
        name: name || undefined,
        dob: dob || undefined,
        department: department || undefined,
        contactNumber: contactNumber ? BigInt(contactNumber) : undefined,
        avatar: avatarUrl,
        designation: designation || undefined,
      },
    });

    res.status(200).json(serialize(updatedFaculty));
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const createTest = async (req, res) => {
  try {
    const { subjectCode, department, year, section, date, test, totalMarks } = req.body;
    const errors = { testError: "" };

    const existingTest = await prisma.test.findFirst({
      where: {
        subjectCode,
        department,
        year: year.toString(),
        section,
        test,
      },
    });
    if (existingTest) {
      errors.testError = "Given Test is already created";
      return res.status(400).json(errors);
    }

    const newTest = await prisma.test.create({
      data: {
        totalMarks: parseInt(totalMarks) || 10,
        section,
        test,
        date,
        department,
        subjectCode,
        year: year.toString(),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Test added successfully",
      response: newTest,
    });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const getTest = async (req, res) => {
  try {
    const { department, year, section } = req.body;

    const tests = await prisma.test.findMany({
      where: { department, year: year.toString(), section },
    });

    res.status(200).json({ result: tests });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const getStudent = async (req, res) => {
  try {
    const { department, year, section } = req.body;
    const errors = { noStudentError: "" };

    const students = await prisma.student.findMany({
      where: { department, year: parseInt(year), section },
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

// Optimised to upload all student marks in a single SQL bulk insert operation
export const uploadMarks = async (req, res) => {
  try {
    const { department, year, section, test, marks } = req.body;
    const errors = { examError: "" };

    const existingTest = await prisma.test.findFirst({
      where: { department, year: year.toString(), section, test },
    });
    if (!existingTest) {
      return res.status(404).json({ message: "Test not found" });
    }

    const isAlready = await prisma.marks.findMany({
      where: { testId: existingTest.id },
    });
    if (isAlready.length !== 0) {
      errors.examError = "You have already uploaded marks of given exam";
      return res.status(400).json(errors);
    }

    // Build the bulk write dataset
    const marksData = marks.map((mark) => ({
      studentId: parseInt(mark._id),
      testId: existingTest.id,
      marks: parseInt(mark.value) || -1,
    }));

    // Single query bulk insert statement
    await prisma.marks.createMany({
      data: marksData,
    });

    res.status(200).json({ message: "Marks uploaded successfully" });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

// Optimised to update attendance in a single batch transactional operation, solving the N+1 loop query issue
export const markAttendance = async (req, res) => {
  try {
    const { selectedStudents, subjectName, department, year, section } = req.body;

    const sub = await prisma.subject.findUnique({ where: { subjectCode: subjectName } });
    if (!sub) {
      return res.status(404).json({ message: "Subject not found" });
    }

    // 1. Fetch all students in the class
    const allStudents = await prisma.student.findMany({
      where: { department, year: parseInt(year), section },
    });
    const studentIds = allStudents.map((s) => s.id);
    const selectedStudentIds = selectedStudents.map((id) => parseInt(id));

    // 2. Find existing attendance records for these students
    const existingAttendance = await prisma.attendance.findMany({
      where: {
        studentId: { in: studentIds },
        subjectId: sub.id,
      },
    });
    const existingStudentIds = existingAttendance.map((a) => a.studentId);

    // 3. Find students who don't have attendance records yet
    const missingStudentIds = studentIds.filter((id) => !existingStudentIds.includes(id));

    // 4. Batch create missing records in a single query
    if (missingStudentIds.length > 0) {
      await prisma.attendance.createMany({
        data: missingStudentIds.map((id) => ({
          studentId: id,
          subjectId: sub.id,
          totalLecturesByFaculty: 0,
          lectureAttended: 0,
        })),
      });
    }

    // 5. Run two atomic bulk update queries
    // Increment total lectures held by faculty for ALL students in the class
    await prisma.attendance.updateMany({
      where: {
        studentId: { in: studentIds },
        subjectId: sub.id,
      },
      data: {
        totalLecturesByFaculty: { increment: 1 },
      },
    });

    // Increment attended lectures only for the students who were present
    if (selectedStudentIds.length > 0) {
      await prisma.attendance.updateMany({
        where: {
          studentId: { in: selectedStudentIds },
          subjectId: sub.id,
        },
        data: {
          lectureAttended: { increment: 1 },
        },
      });
    }

    res.status(200).json({ message: "Attendance Marked successfully" });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};
