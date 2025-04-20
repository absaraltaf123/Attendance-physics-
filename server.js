const express = require('express');
const fs = require('fs').promises; // Use promise-based fs
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware to parse JSON request bodies
app.use(express.json());

// --- Data Management Functions ---
let dataCache = null; // Simple in-memory cache

async function loadData() {
    console.log("Attempting to load data...");
    try {
        // Force read from file for consistency
        console.log("Reading data file from:", DATA_FILE);
        const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
        console.log("Data file read successfully.");

        try {
            dataCache = JSON.parse(fileContent);
            console.log("Data file parsed successfully.");
        } catch (parseError) {
            console.error('!!! CRITICAL: Error parsing data.json:', parseError);
            console.error('!!! Data file content was:', fileContent);
            console.log('!!! Returning default structure due to parse error.');
            // Ensure the default structure has an empty attendance object
            dataCache = { students: [], attendance: {} };
        }

        // Ensure basic structure exists
        if (!dataCache) dataCache = { students: [], attendance: {} };
        if (!dataCache.students) dataCache.students = [];
        if (!dataCache.attendance) dataCache.attendance = {}; // Ensure attendance object exists

        console.log(`Data loaded: ${dataCache.students.length} students, ${Object.keys(dataCache.attendance).length} subjects.`);
        return dataCache;

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Data file not found (ENOENT). Creating default file.');
            // Ensure the default structure has an empty attendance object
            dataCache = { students: [], attendance: {} };
            try {
                await saveData(dataCache);
                console.log('Default data file created successfully.');
            } catch (saveError) {
                console.error('!!! CRITICAL: Failed to save default data file:', saveError);
            }
        } else {
            console.error('!!! CRITICAL: Error reading data file:', error);
            console.log('!!! Returning default structure due to read error.');
            dataCache = { students: [], attendance: {} };
        }
        return dataCache;
    }
}

async function saveData(data) {
    const dataString = JSON.stringify(data, null, 2);
    console.log("Attempting to save data to file:", DATA_FILE);
    try {
        await fs.writeFile(DATA_FILE, dataString, 'utf-8');
        dataCache = data; // Update cache *only after* successful save
        console.log("Data saved successfully to file.");
    } catch (error) {
        console.error('!!! CRITICAL: Error writing data file:', error);
        throw new Error('Failed to save data to the server file.');
    }
}

// --- Simple Debug Route ---
app.get('/ping', (req, res) => {
    console.log(`--> GET /ping request received at ${new Date().toISOString()}`);
    res.status(200).send('pong');
    console.log(`<-- GET /ping response sent.`);
});

// --- API Endpoints ---

// Get all students (Unchanged)
app.get('/api/students', async (req, res) => {
    console.log(`--> GET /api/students request received at ${new Date().toISOString()}`);
    try {
        const data = await loadData();
        console.log(`Sending ${data.students?.length || 0} students.`);
        res.json(data.students || []);
    } catch (error) {
        console.error('!!! Error in GET /api/students:', error);
        res.status(500).json({ message: "Error loading student data." });
    }
    console.log(`<-- GET /api/students response sent.`);
});

// Add a student (Unchanged)
app.post('/api/students', async (req, res) => {
    console.log(`--> POST /api/students request received at ${new Date().toISOString()}`);
    console.log("Request body:", req.body);
    try {
        const { roll_no, name, course } = req.body;
        if (!roll_no || !name) {
            console.log("Validation failed: Roll number or name missing.");
            return res.status(400).json({ message: "Roll number and name are required." });
        }

        const data = await loadData();
        const existing = data.students.find(s => s.roll_no === roll_no);
        if (existing) {
             console.log(`Validation failed: Student ${roll_no} already exists.`);
            return res.status(400).json({ message: `Student with roll number ${roll_no} already exists.` });
        }

        const newStudent = { roll_no, name, course: course || "N/A" };
        data.students.push(newStudent);
        data.students.sort((a, b) => (a.roll_no || '').localeCompare(b.roll_no || ''));

        await saveData(data);
        console.log(`Student ${roll_no} added successfully.`);
        res.status(201).json(newStudent);

    } catch (error) {
        console.error('!!! Error in POST /api/students:', error);
        res.status(500).json({ message: error.message || "Error adding student." });
    }
     console.log(`<-- POST /api/students response sent.`);
});

// Remove a student (UPDATED to iterate through subjects)
app.delete('/api/students/:roll_no', async (req, res) => {
    const roll_no_to_delete = req.params.roll_no;
    console.log(`--> DELETE /api/students/${roll_no_to_delete} request received at ${new Date().toISOString()}`);
    try {
        const data = await loadData();
        const initialLength = data.students.length;
        data.students = data.students.filter(s => s.roll_no !== roll_no_to_delete);

        if (data.students.length === initialLength) {
            console.log(`Student ${roll_no_to_delete} not found for deletion.`);
            return res.status(404).json({ message: `Student with roll number ${roll_no_to_delete} not found.` });
        }

        console.log(`Student ${roll_no_to_delete} found, removing...`);
        // Also remove student from existing attendance records across all subjects
        let attendanceChanged = false;
        // Iterate through each subject in the attendance object
        Object.keys(data.attendance).forEach(subject => {
            // Iterate through each date within the subject
            Object.keys(data.attendance[subject]).forEach(date => {
                const initialAttLength = data.attendance[subject][date].length;
                data.attendance[subject][date] = data.attendance[subject][date].filter(att => att.roll_no !== roll_no_to_delete);
                if (data.attendance[subject][date].length < initialAttLength) {
                    attendanceChanged = true;
                }
                // Optional: Clean up empty date entries if desired
                // if (data.attendance[subject][date].length === 0) {
                //     delete data.attendance[subject][date];
                // }
            });
             // Optional: Clean up empty subject entries if desired
             // if (Object.keys(data.attendance[subject]).length === 0) {
             //     delete data.attendance[subject];
             // }
        });

         if (attendanceChanged) {
            console.log(`Removed attendance records for student ${roll_no_to_delete} across subjects.`);
         }

        await saveData(data);
        console.log(`Student ${roll_no_to_delete} deleted successfully.`);
        res.status(200).json({ message: `Student ${roll_no_to_delete} deleted successfully.` });

    } catch (error) {
        console.error(`!!! Error in DELETE /api/students/${roll_no_to_delete}:`, error);
        res.status(500).json({ message: error.message || "Error deleting student." });
    }
    console.log(`<-- DELETE /api/students/${roll_no_to_delete} response sent.`);
});

// Get all attendance data (UPDATED to return the nested structure)
app.get('/api/attendance', async (req, res) => {
    console.log(`--> GET /api/attendance request received at ${new Date().toISOString()}`);
    try {
        const data = await loadData();
        const attendanceData = data.attendance || {}; // Ensure it's an object
        console.log(`Sending attendance data for ${Object.keys(attendanceData).length} subjects.`);
        res.json(attendanceData);
    } catch (error) {
        console.error('!!! Error in GET /api/attendance:', error);
        res.status(500).json({ message: "Error loading attendance data." });
    }
    console.log(`<-- GET /api/attendance response sent.`);
});

// Get attendance for a specific subject and date (NEW/MODIFIED endpoint)
app.get('/api/attendance/:subject/:date', async (req, res) => {
    const subject = decodeURIComponent(req.params.subject); // Decode subject name
    const date = req.params.date;
    console.log(`--> GET /api/attendance/${subject}/${date} request received at ${new Date().toISOString()}`);
    try {
        // Basic date validation (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            console.log(`Validation failed: Invalid date format ${date}.`);
            return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
        }
        // Basic subject validation (non-empty)
        if (!subject) {
            console.log(`Validation failed: Subject parameter is missing.`);
            return res.status(400).json({ message: "Subject is required." });
        }

        const data = await loadData();
        // Access nested data safely
        const dateData = data.attendance?.[subject]?.[date] || [];
        console.log(`Sending ${dateData.length} attendance records for subject ${subject} on date ${date}.`);
        res.json(dateData); // Return empty array if subject or date not found

    } catch (error) {
        console.error(`!!! Error in GET /api/attendance/${subject}/${date}:`, error);
        res.status(500).json({ message: "Error loading attendance data for the subject and date." });
    }
     console.log(`<-- GET /api/attendance/${subject}/${date} response sent.`);
});

// Save/Update attendance for a specific subject and date (MODIFIED endpoint)
app.post('/api/attendance/:subject/:date', async (req, res) => {
    const subject = decodeURIComponent(req.params.subject); // Decode subject name
    const date = req.params.date;
    console.log(`--> POST /api/attendance/${subject}/${date} request received at ${new Date().toISOString()}`);
    console.log("Request body:", JSON.stringify(req.body));
    try {
        // Date validation
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
             console.log(`Validation failed: Invalid date format ${date}.`);
             return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
        }
        // Subject validation
        if (!subject) {
            console.log(`Validation failed: Subject parameter is missing.`);
            return res.status(400).json({ message: "Subject is required." });
        }

        const attendanceList = req.body;
        if (!Array.isArray(attendanceList)) {
            console.log("Validation failed: Request body is not an array.");
            return res.status(400).json({ message: "Invalid data format. Expected an array." });
        }

        // Basic validation of the list items
        const validStatuses = ['present', 'absent'];
        const isValid = attendanceList.every(item =>
            item && typeof item.roll_no === 'string' && item.roll_no.trim() !== '' &&
            typeof item.status === 'string' && validStatuses.includes(item.status)
        );
        if (!isValid) {
            console.log("Validation failed: Invalid data within the attendance list array.");
            return res.status(400).json({ message: "Invalid attendance data in the list. Each item must have non-empty roll_no and a valid status ('present' or 'absent')." });
        }

        const data = await loadData();

        // Enrich attendance with names (filter out entries for non-existent students)
        const enrichedAttendance = attendanceList.map(att => {
            const student = data.students.find(s => s.roll_no === att.roll_no);
            if (student) {
                return { ...att, name: student.name }; // Include name for consistency
            }
            return null;
        }).filter(Boolean); // Remove nulls

        // Ensure the subject key exists in attendance
        if (!data.attendance[subject]) {
            console.log(`Subject '${subject}' not found in data, creating it.`);
            data.attendance[subject] = {};
        }

        console.log(`Updating attendance for subject '${subject}', date '${date}' with ${enrichedAttendance.length} valid records.`);
        data.attendance[subject][date] = enrichedAttendance; // Update the specific subject and date

        await saveData(data); // Save the entire updated data object

        console.log(`Attendance for subject '${subject}' on date '${date}' saved successfully.`);
        res.status(200).json({ message: `Attendance for ${subject} on ${date} saved successfully.` });

    } catch (error) {
        console.error(`!!! Error in POST /api/attendance/${subject}/${date}:`, error);
        if (error.message === 'Failed to save data to the server file.') {
             res.status(500).json({ message: "Server failed to save the attendance data file." });
        } else {
             res.status(500).json({ message: error.message || "Error saving attendance data." });
        }
    }
     console.log(`<-- POST /api/attendance/${subject}/${date} response sent.`);
});

// Generate Printable HTML for a subject and date (MODIFIED endpoint)
app.get('/admin/print/:subject/:date', async (req, res) => {
    const subject = decodeURIComponent(req.params.subject);
    const date = req.params.date;
    console.log(`--> GET /admin/print/${subject}/${date} request received at ${new Date().toISOString()}`);
    try {
         if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
             console.log(`Validation failed: Invalid date format ${date}.`);
             return res.status(400).send("Invalid date format. Use YYYY-MM-DD.");
         }
         if (!subject) {
            console.log(`Validation failed: Subject parameter is missing.`);
            return res.status(400).send("Subject is required.");
         }

        const data = await loadData();
        const attendanceList = data.attendance?.[subject]?.[date] || [];
        const presentStudents = attendanceList.filter(s => s.status === 'present');
        const totalStudents = data.students?.length || 0;

        console.log(`Generating print view for Subject: ${subject}, Date: ${date}: ${presentStudents.length} present out of ${totalStudents} total students.`);

        // Simple HTML for printing
        let html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Attendance Printout - ${subject} - ${date}</title>
                <style>
                    body { font-family: sans-serif; margin: 20px; }
                    h1, h2, h3 { text-align: center; }
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
                <h2>Subject: ${subject}</h2>
                <h3>Date: ${date}</h3>
                <h4>Present Students (${presentStudents.length} / ${totalStudents})</h4>
                ${presentStudents.length > 0 ? `
                <table>
                    <thead>
                        <tr><th>Roll No</th><th>Name</th></tr>
                    </thead>
                    <tbody>
                        ${presentStudents.map(student => `
                            <tr><td>${student.roll_no || 'N/A'}</td><td>${student.name || 'N/A'}</td></tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : '<p style="text-align:center;">No students marked present for this subject on this date.</p>'}

                <div class="print-info">
                    <button onclick="window.print()">Print this page</button>
                </div>
            </body>
            </html>
        `;
        res.send(html);

    } catch (error) {
        console.error(`!!! Error in GET /admin/print/${subject}/${date}:`, error);
        res.status(500).send("Error generating printable view.");
    }
     console.log(`<-- GET /admin/print/${subject}/${date} response sent.`);
});


// --- Serving Static Files ---

// Serve the frontend from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the admin interface from 'admin' directory
app.use('/admin', express.static(path.join(__dirname, 'admin')));
// Specific route for the admin HTML file itself
app.get('/admin', (req, res) => {
    console.log(`--> GET /admin request received (serving admin.html) at ${new Date().toISOString()}`);
    res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
     console.log(`<-- GET /admin response sent.`);
});

// Fallback for the frontend SPA (or just index.html)
app.get('*', (req, res) => {
  console.log(`--> GET /* fallback route requested for path: ${req.path} at ${new Date().toISOString()}`);
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin/') || req.path.includes('.')) {
     console.log(`Path ${req.path} not handled, sending 404.`);
    res.status(404).send('Not Found');
  } else {
    console.log(`Serving public/index.html as fallback for path: ${req.path}`);
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
   console.log(`<-- GET /* fallback response sent.`);
});


// --- Global Error Handlers ---
process.on('uncaughtException', (error) => {
  console.error('!!! UNCAUGHT EXCEPTION:', error);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('!!! UNHANDLED REJECTION:', reason);
});

// --- Start Server ---
app.listen(PORT, async () => {
    console.log(`Server starting on port ${PORT}...`);
    try {
        await loadData();
        console.log("Initial data load completed.");
    } catch (err) {
        console.error("!!! CRITICAL: Error during initial data load on startup:", err);
    }
    console.log(`Server listening on port ${PORT}`);
    console.log(`Frontend available at http://localhost:${PORT}`);
    console.log(`Admin available at http://localhost:${PORT}/admin`);
});
