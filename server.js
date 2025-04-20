const express = require('express');
const fs = require('fs').promises; // Use promise-based fs
const path = require('path');

const app = express();
// Use the port Render provides, or 3000 for local development
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware to parse JSON request bodies
app.use(express.json());

// --- Data Management Functions ---
let dataCache = null; // Simple in-memory cache

async function loadData() {
    try {
        if (dataCache) {
            // console.log("Serving data from cache");
            return dataCache;
        }
        console.log("Reading data from file:", DATA_FILE);
        const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
        dataCache = JSON.parse(fileContent);
        // Ensure basic structure exists if file was empty/corrupted
        if (!dataCache.students) dataCache.students = [];
        if (!dataCache.attendance) dataCache.attendance = {};
        return dataCache;
    } catch (error) {
        console.error('Error reading data file:', error);
        // If file doesn't exist or is invalid, start with default structure
        dataCache = { students: [], attendance: {} };
        // Attempt to create the file if it doesn't exist
        if (error.code === 'ENOENT') {
            await saveData(dataCache); // Save the default structure
        }
        return dataCache; // Return default structure on error
    }
}

async function saveData(data) {
    try {
        console.log("Saving data to file:", DATA_FILE);
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
        dataCache = data; // Update cache after successful save
        console.log("Data saved successfully.");
    } catch (error) {
        console.error('Error writing data file:', error);
        // Re-throw or handle as needed; prevents client from getting success message on failure
        throw new Error('Failed to save data to the server.');
    }
}

// --- API Endpoints ---

// Get all students
app.get('/api/students', async (req, res) => {
    try {
        const data = await loadData();
        res.json(data.students || []);
    } catch (error) {
        res.status(500).json({ message: "Error loading student data." });
    }
});

// Add a student
app.post('/api/students', async (req, res) => {
    try {
        const { roll_no, name, course } = req.body;
        if (!roll_no || !name) {
            return res.status(400).json({ message: "Roll number and name are required." });
        }

        const data = await loadData();
        const existing = data.students.find(s => s.roll_no === roll_no);
        if (existing) {
            return res.status(400).json({ message: `Student with roll number ${roll_no} already exists.` });
        }

        const newStudent = { roll_no, name, course: course || "N/A" };
        data.students.push(newStudent);
        data.students.sort((a, b) => a.roll_no.localeCompare(b.roll_no)); // Keep sorted

        await saveData(data);
        res.status(201).json(newStudent);
    } catch (error) {
        console.error("Error adding student:", error);
        res.status(500).json({ message: error.message || "Error adding student." });
    }
});

// Remove a student
app.delete('/api/students/:roll_no', async (req, res) => {
    try {
        const roll_no_to_delete = req.params.roll_no;
        const data = await loadData();

        const initialLength = data.students.length;
        data.students = data.students.filter(s => s.roll_no !== roll_no_to_delete);

        if (data.students.length === initialLength) {
            return res.status(404).json({ message: `Student with roll number ${roll_no_to_delete} not found.` });
        }

        // Also remove student from existing attendance records (optional, but good practice)
        Object.keys(data.attendance).forEach(date => {
            data.attendance[date] = data.attendance[date].filter(att => att.roll_no !== roll_no_to_delete);
        });

        await saveData(data);
        res.status(200).json({ message: `Student ${roll_no_to_delete} deleted successfully.` });
    } catch (error) {
        console.error("Error deleting student:", error);
        res.status(500).json({ message: error.message || "Error deleting student." });
    }
});

// Get all attendance data (for frontend initial load)
app.get('/api/attendance', async (req, res) => {
    try {
        const data = await loadData();
        res.json(data.attendance || {});
    } catch (error) {
        res.status(500).json({ message: "Error loading attendance data." });
    }
});

// Get attendance for a specific date (for admin loading)
app.get('/api/attendance/:date', async (req, res) => {
    try {
        const date = req.params.date;
        // Basic date validation (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
             return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
        }
        const data = await loadData();
        res.json(data.attendance[date] || []); // Return empty array if date not found
    } catch (error) {
        res.status(500).json({ message: "Error loading attendance data for the date." });
    }
});

// Save/Update attendance for a specific date
app.post('/api/attendance/:date', async (req, res) => {
    try {
        const date = req.params.date;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
             return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
        }
        const attendanceList = req.body; // Expecting an array of {roll_no, status}

        if (!Array.isArray(attendanceList)) {
            return res.status(400).json({ message: "Invalid data format. Expected an array." });
        }

        // Basic validation of the list
        const validStatuses = ['present', 'absent'];
        const isValid = attendanceList.every(item =>
            item && typeof item.roll_no === 'string' && typeof item.status === 'string' && validStatuses.includes(item.status)
        );

        if (!isValid) {
             return res.status(400).json({ message: "Invalid attendance data in the list. Each item must have roll_no and a valid status ('present' or 'absent')." });
        }

        const data = await loadData();
        // Add student names to the saved data for easier use later (optional)
        const enrichedAttendance = attendanceList.map(att => {
            const student = data.students.find(s => s.roll_no === att.roll_no);
            return { ...att, name: student ? student.name : 'Unknown' };
        });

        data.attendance[date] = enrichedAttendance;
        await saveData(data);
        res.status(200).json({ message: `Attendance for ${date} saved successfully.` });

    } catch (error) {
        console.error(`Error saving attendance for date ${req.params.date}:`, error);
        res.status(500).json({ message: error.message || "Error saving attendance data." });
    }
});

// Generate Printable HTML for a date
app.get('/admin/print/:date', async (req, res) => {
    try {
        const date = req.params.date;
         if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
             return res.status(400).send("Invalid date format. Use YYYY-MM-DD.");
         }
        const data = await loadData();
        const attendanceList = data.attendance[date] || [];
        const presentStudents = attendanceList.filter(s => s.status === 'present');

        // Simple HTML for printing
        let html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Attendance Printout - ${date}</title>
                <style>
                    body { font-family: sans-serif; margin: 20px; }
                    h1, h2 { text-align: center; }
                    table { width: 80%; margin: 20px auto; border-collapse: collapse; border: 1px solid #ccc; }
                    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    .print-info { text-align: center; margin-top: 30px; font-size: 0.9em; color: #555; }
                    @media print {
                        button { display: none; }
                        .print-info { display: none; }
                    }
                </style>
            </head>
            <body>
                <h1>Student Attendance</h1>
                <h2>Date: ${date}</h2>
                <h2>Present Students (${presentStudents.length} / ${data.students.length})</h2>
                ${presentStudents.length > 0 ? `
                <table>
                    <thead>
                        <tr><th>Roll No</th><th>Name</th></tr>
                    </thead>
                    <tbody>
                        ${presentStudents.map(student => `
                            <tr><td>${student.roll_no}</td><td>${student.name}</td></tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : '<p style="text-align:center;">No students marked present.</p>'}

                <div class="print-info">
                    <button onclick="window.print()">Print this page</button>
                </div>
            </body>
            </html>
        `;
        res.send(html);

    } catch (error) {
        console.error(`Error generating print view for date ${req.params.date}:`, error);
        res.status(500).send("Error generating printable view.");
    }
});


// --- Serving Static Files ---

// Serve the frontend from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the admin interface (password protect this in a real scenario!)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
});

// Fallback for the frontend SPA (Single Page App) - handles refresh
// If you only have index.html, this might not be strictly needed, but good practice
app.get('*', (req, res) => {
  // Check if the request looks like an API call or a file request first
  if (req.path.startsWith('/api/') || req.path.includes('.')) {
    // If it's an API call not handled above or a file request, let it 404
    res.status(404).send('Not Found');
  } else {
    // Otherwise, serve the main frontend page for client-side routing
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});


// --- Start Server ---
app.listen(PORT, async () => {
    console.log(`Server starting on port ${PORT}...`);
    await loadData(); // Pre-load data on start
    console.log(`Server listening on port ${PORT}`);
    console.log(`Frontend available at http://localhost:${PORT}`);
    console.log(`Admin available at http://localhost:${PORT}/admin`);
});
