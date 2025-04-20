const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // Use Render's port or 3000 locally

const DATA_DIR = path.join(__dirname, 'data');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');

// --- Data Storage Initialization ---
let students = [];
let attendanceData = {};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Load initial data or create files if they don't exist
function loadData() {
    try {
        if (fs.existsSync(STUDENTS_FILE)) {
            const studentData = fs.readFileSync(STUDENTS_FILE, 'utf8');
            students = JSON.parse(studentData);
            console.log(`Loaded ${students.length} students from ${STUDENTS_FILE}`);
        } else {
            // Start with default students if file doesn't exist
            students = [
                {"roll_no": "220351", "name": "MOHD ANSARY"},
                {"roll_no": "220361", "name": "ZAKIR HUSSAIN TAK"},
                {"roll_no": "220362", "name": "NUMAN BASHIR DAR"},
                {"roll_no": "220363", "name": "FAISAL AHMAD MIR"},
                {"roll_no": "220364", "name": "MOHD IMRAN"},
                {"roll_no": "220365", "name": "SHAHID BASHIR SHEIKH"},
                {"roll_no": "220366", "name": "AAMIR ALI WANI"},
                {"roll_no": "220368", "name": "SHAKEEL SIDIQI"},
                {"roll_no": "220370", "name": "OVAIS MANZOOR BABA"},
                {"roll_no": "220371", "name": "MOHAMMAD HANZAL BHAT"},
                {"roll_no": "220372", "name": "ABSAR ALTAF SHAH"},
                {"roll_no": "220374", "name": "MUZAMIL HUSSAIN"},
                {"roll_no": "220421", "name": "MEHVISH MANZOOR"},
                {"roll_no": "220423", "name": "ATTA UL MUSTAFA"},
                {"roll_no": "220424", "name": "SHABNAM ARA"},
                {"roll_no": "220425", "name": "IQRA ASHRAF DAR"},
                {"roll_no": "220426", "name": "FAZIL ALI WANI"},
                {"roll_no": "220427", "name": "UMAR ALI BHAT"},
                {"roll_no": "220428", "name": "ZEENAT NABI"},
                {"roll_no": "220429", "name": "MIR SURIYA NISAR"},
                {"roll_no": "220430", "name": "SHAHNAWAZ AKBAR"}
            ];
            saveStudents(); // Save defaults
            console.log(`Created ${STUDENTS_FILE} with default students.`);
        }
    } catch (err) {
        console.error(`Error loading students data: ${err}`);
        students = []; // Fallback to empty list
    }

    try {
        if (fs.existsSync(ATTENDANCE_FILE)) {
            const attData = fs.readFileSync(ATTENDANCE_FILE, 'utf8');
            attendanceData = JSON.parse(attData);
            console.log(`Loaded attendance data for ${Object.keys(attendanceData).length} dates from ${ATTENDANCE_FILE}`);
        } else {
            attendanceData = {};
            saveAttendanceData(); // Create empty file
            console.log(`Created empty ${ATTENDANCE_FILE}.`);
        }
    } catch (err) {
        console.error(`Error loading attendance data: ${err}`);
        attendanceData = {}; // Fallback to empty object
    }
}

function saveStudents() {
    try {
        fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2), 'utf8'); // Pretty print JSON
        console.log('Students data saved.');
        return true;
    } catch (err) {
        console.error(`Error saving students data: ${err}`);
        return false;
    }
}

function saveAttendanceData() {
    try {
        fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(attendanceData, null, 2), 'utf8');
        console.log('Attendance data saved.');
        return true;
    } catch (err) {
        console.error(`Error saving attendance data: ${err}`);
        return false;
    }
}

// --- Middleware ---
app.use(express.json()); // Parse JSON request bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve front-end files

// --- API Endpoints ---

// GET Students
app.get('/api/students', (req, res) => {
    res.json(students);
});

// POST Add Student (Admin only)
app.post('/api/students', (req, res) => {
    const { roll_no, name } = req.body;
    if (!roll_no || !name) {
        return res.status(400).json({ message: 'Roll No and Name are required' });
    }
    if (students.some(s => s.roll_no === roll_no)) {
        return res.status(400).json({ message: 'Student with this Roll No already exists' });
    }
    const newStudent = { roll_no, name };
    students.push(newStudent);
    if (saveStudents()) {
        res.status(201).json(newStudent);
    } else {
        // Revert add if save failed
        students.pop();
        res.status(500).json({ message: 'Failed to save student data' });
    }
});

// DELETE Student (Admin only)
app.delete('/api/students/:roll_no', (req, res) => {
    const rollNoToDelete = req.params.roll_no;
    const initialLength = students.length;
    students = students.filter(s => s.roll_no !== rollNoToDelete);

    if (students.length < initialLength) {
        if (saveStudents()) {
            res.status(200).json({ message: `Student ${rollNoToDelete} deleted` });
        } else {
            // If save failed, we might need to reload data to be safe
            loadData(); // Reload to revert the in-memory change
            res.status(500).json({ message: 'Failed to save student data after deletion' });
        }
    } else {
        res.status(404).json({ message: `Student ${rollNoToDelete} not found` });
    }
});

// GET Attendance Dates
app.get('/api/attendance/dates', (req, res) => {
    res.json(Object.keys(attendanceData).sort().reverse()); // Newest first
});

// GET Attendance for a specific date
app.get('/api/attendance/:date', (req, res) => {
    const date = req.params.date;
    if (attendanceData[date]) {
        res.json(attendanceData[date]);
    } else {
        // Return empty array or default structure if preferred for non-existent date
        res.json([]);
        // Or: res.status(404).json({ message: 'No attendance data found for this date' });
    }
});

// POST Save/Update Attendance for a specific date (Admin only)
app.post('/api/attendance/:date', (req, res) => {
    const date = req.params.date;
    const attendanceList = req.body; // Expecting an array of {roll_no, name, status}

    if (!Array.isArray(attendanceList)) {
        return res.status(400).json({ message: 'Invalid attendance data format. Expected an array.' });
    }

    // Basic validation (could be more robust)
    if (attendanceList.some(item => !item.roll_no || !item.status)) {
        return res.status(400).json({ message: 'Each attendance record must have roll_no and status.' });
    }

    attendanceData[date] = attendanceList;
    if (saveAttendanceData()) {
        res.status(200).json({ message: `Attendance for ${date} saved successfully.` });
    } else {
        // Revert in-memory change if save failed
        delete attendanceData[date]; // Or reload previous state if possible
        res.status(500).json({ message: 'Failed to save attendance data.' });
    }
});

// --- Metrics & Ranking Calculation (Server-side) ---

function calculateMetrics() {
    const dates = Object.keys(attendanceData);
    const totalClasses = dates.length;
    let studentMetrics = {};
    students.forEach(s => {
        studentMetrics[s.roll_no] = { name: s.name, present: 0, absent: 0, total: 0 };
    });

    let dailyRates = {};
    let allDatesSorted = dates.sort();
    let totalPresentOverall = 0;
    let totalRecordsOverall = 0;

    allDatesSorted.forEach(date => {
        const attendanceList = attendanceData[date] || [];
        let presentCount = 0;
        let validEntriesCount = 0;
        attendanceList.forEach(entry => {
            const rollNo = entry.roll_no;
            // Ensure student still exists in the main list before counting
            if (studentMetrics[rollNo]) {
                 validEntriesCount++;
                 totalRecordsOverall++;
                 studentMetrics[rollNo].total++;
                 if (entry.status === "present") {
                     studentMetrics[rollNo].present++;
                     presentCount++;
                     totalPresentOverall++;
                 } else if (entry.status === "absent") {
                     studentMetrics[rollNo].absent++;
                 }
            }
        });
        dailyRates[date] = validEntriesCount > 0 ? (presentCount / validEntriesCount) * 100 : 0;
    });

    let bestDayDate = "-";
    let worstDayDate = "-";
    let bestDayVal = 0;
    let worstDayVal = 100; // Start high for min

    if (Object.keys(dailyRates).length > 0) {
         const rates = Object.values(dailyRates);
         bestDayVal = Math.max(...rates);
         worstDayVal = Math.min(...rates);
         bestDayDate = Object.keys(dailyRates).find(d => dailyRates[d] === bestDayVal) || "-";
         worstDayDate = Object.keys(dailyRates).find(d => dailyRates[d] === worstDayVal) || "-";
    }


    const avgAttendanceOverall = totalRecordsOverall > 0 ? (totalPresentOverall / totalRecordsOverall) * 100 : 0;

    return {
        totalClasses,
        avgAttendance: avgAttendanceOverall,
        bestDay: { date: bestDayDate, value: bestDayVal },
        worstDay: { date: worstDayDate, value: worstDayVal },
        studentMetrics, // Detailed student stats
        dailyRates      // For trend chart
    };
}

// GET Overall Metrics
app.get('/api/metrics', (req, res) => {
    const metrics = calculateMetrics();
    res.json({
        totalClasses: metrics.totalClasses,
        avgAttendance: metrics.avgAttendance.toFixed(1) + '%',
        bestDay: metrics.bestDay.date !== "-" ? `${metrics.bestDay.date} (${metrics.bestDay.value.toFixed(1)}%)` : "-",
        worstDay: metrics.worstDay.date !== "-" ? `${metrics.worstDay.date} (${metrics.worstDay.value.toFixed(1)}%)` : "-",
        dailyRates: metrics.dailyRates // Send daily rates for trend chart
    });
});

// GET Detailed Student Metrics (for the table)
app.get('/api/metrics/students', (req, res) => {
    const { studentMetrics } = calculateMetrics();
    const studentList = Object.entries(studentMetrics).map(([rollNo, metrics]) => {
        const attendancePercent = metrics.total > 0 ? (metrics.present / metrics.total) * 100 : 0;
        return {
            roll_no: rollNo,
            name: metrics.name,
            present: metrics.present,
            absent: metrics.absent,
            attendance_percent: attendancePercent.toFixed(1)
        };
    });
    res.json(studentList);
});

// GET Rankings
app.get('/api/rankings', (req, res) => {
    const { studentMetrics } = calculateMetrics();
    let studentSummary = Object.entries(studentMetrics).map(([rollNo, metrics]) => {
        const attendancePercent = metrics.total > 0 ? (metrics.present / metrics.total) * 100 : 0;
        return {
            roll_no: rollNo,
            name: metrics.name,
            attendance_percent: attendancePercent
        };
    });

    studentSummary.sort((a, b) => {
        if (b.attendance_percent !== a.attendance_percent) {
            return b.attendance_percent - a.attendance_percent;
        }
        return a.name.localeCompare(b.name);
    });

    // Add rank
    let currentRank = 0;
    let lastPercent = -1;
    let studentsAtRank = 0;
    const rankedList = studentSummary.map((summary) => {
         const percent = summary.attendance_percent;
         if (percent !== lastPercent) {
            currentRank += (studentsAtRank + 1);
            studentsAtRank = 0;
            lastPercent = percent;
         } else {
            studentsAtRank++;
         }
        return {
            rank: currentRank,
            ...summary,
            attendance_percent: percent.toFixed(1) // Format for display
        };
    });

    res.json(rankedList);
});


// --- Admin Page ---
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
});
// Serve admin JS file (make sure it's requested correctly from admin.html)
app.get('/admin/admin.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin.js'));
});
// Optional: Serve admin CSS if you create one
// app.get('/admin/admin.css', (req, res) => {
//     res.sendFile(path.join(__dirname, 'admin', 'admin.css'));
// });

// --- Catch-all for front-end SPA routing (if needed, usually not for this simple structure) ---
// app.get('*', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });


// --- Server Start ---
loadData(); // Load data when server starts

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin interface available at http://localhost:${PORT}/admin`);
});