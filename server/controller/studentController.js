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

export const studentLogin = async (req, res) => {
  const { username, password } = req.body;
  const errors = { usernameError: "", passwordError: "" };
  try {
    const existingStudent = await prisma.student.findUnique({
      where: { username }
    });
    if (!existingStudent) {
      errors.usernameError = "Student doesn't exist.";
      return res.status(404).json(errors);
    }
    const isPasswordCorrect = await bcrypt.compare(
      password,
      existingStudent.password
    );
    if (!isPasswordCorrect) {
      errors.passwordError = "Invalid Credentials";
      return res.status(404).json(errors);
    }

    const token = jwt.sign(
      {
        email: existingStudent.email,
        id: existingStudent.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({ result: serialize(existingStudent), token });
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

    const currentStudent = await prisma.student.findUnique({ where: { email } });
    if (!currentStudent) {
      return res.status(404).json({ message: "Student not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedStudent = await prisma.student.update({
      where: { email },
      data: {
        password: hashedPassword,
        passwordUpdated: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
      response: serialize(updatedStudent),
    });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const {
      name,
      dob,
      department,
      contactNumber,
      avatar,
      email,
      batch,
      section,
      year,
      fatherName,
      motherName,
      fatherContactNumber,
    } = req.body;

    const avatarUrl = avatar ? await uploadImage(avatar) : undefined;

    const updatedStudent = await prisma.student.update({
      where: { email },
      data: {
        name: name || undefined,
        dob: dob || undefined,
        department: department || undefined,
        contactNumber: contactNumber ? BigInt(contactNumber) : undefined,
        avatar: avatarUrl,
        batch: batch || undefined,
        section: section || undefined,
        year: year ? parseInt(year) : undefined,
        fatherName: fatherName || undefined,
        motherName: motherName || undefined,
        fatherContactNumber: fatherContactNumber ? BigInt(fatherContactNumber) : undefined,
      },
    });

    res.status(200).json(serialize(updatedStudent));
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

// Fixed privacy leak: Query exam marks specifically for the logged-in student (req.userId)
export const testResult = async (req, res) => {
  try {
    const { department, year, section } = req.body;
    const errors = { notestError: "" };
    
    // Fetch logged-in student info to confirm class context matches
    const currentStudent = await prisma.student.findUnique({
      where: { id: req.userId }
    });
    if (!currentStudent) {
      return res.status(404).json({ message: "Student not found" });
    }

    const tests = await prisma.test.findMany({
      where: { department, year: year.toString(), section },
    });
    if (tests.length === 0) {
      errors.notestError = "No Test Found";
      return res.status(404).json(errors);
    }

    const testIds = tests.map((t) => t.id);
    // Retrieve marks specifically linked to this student ID
    const studentMarks = await prisma.marks.findMany({
      where: {
        studentId: req.userId,
        testId: { in: testIds },
      },
      include: {
        test: true,
      },
    });

    const result = [];
    for (let i = 0; i < studentMarks.length; i++) {
      const subject = await prisma.subject.findUnique({
        where: { subjectCode: studentMarks[i].test.subjectCode },
      });
      
      result.push({
        marks: studentMarks[i].marks,
        totalMarks: studentMarks[i].test.totalMarks,
        subjectName: subject ? subject.subjectName : "Unknown Subject",
        subjectCode: studentMarks[i].test.subjectCode,
        test: studentMarks[i].test.test,
      });
    }

    res.status(200).json({ result });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};

// Fixed privacy leak: Query attendance specifically for the logged-in student (req.userId)
export const attendance = async (req, res) => {
  try {
    // Retrieve attendance records specifically matching the logged-in student's id
    const studentAttendance = await prisma.attendance.findMany({
      where: { studentId: req.userId },
      include: {
        subject: true,
      },
    });

    if (studentAttendance.length === 0) {
      return res.status(200).json({ result: [] });
    }

    res.status(200).json({
      result: studentAttendance.map((att) => {
        const percentage = att.totalLecturesByFaculty > 0
          ? ((att.lectureAttended / att.totalLecturesByFaculty) * 100).toFixed(2)
          : "0.00";
        return {
          percentage,
          subjectCode: att.subject.subjectCode,
          subjectName: att.subject.subjectName,
          attended: att.lectureAttended,
          total: att.totalLecturesByFaculty,
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ backendError: error.message });
  }
};
