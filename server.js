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
        // Check cache first (optional, but can reduce reads)
        // NOTE: Forcing read from file for debugging consistency after save issues.
        // Remove comment below to re-enable cache reads.
        /*
        if (dataCache) {
             console.log("Serving data from cache");
             return dataCache;
        }
        */
        console.log("Reading data file from:", DATA_FILE);
        const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
        console.log("Data file read successfully.");

        try {
            dataCache = JSON.parse(fileContent);
            console.log("Data file parsed successfully.");
        } catch (parseError) {
            console.error('!!! CRITICAL: Error parsing data.json:', parseError);
            console.error('!!! Data file content was:', fileContent); // Log content if parse fails
            console.log('!!! Returning default structure due to parse error.');
            dataCache = { students: [], attendance: {} }; // Use default on parse error
        }

        // Ensure basic structure exists even if file was valid JSON but empty/missing keys
        if (!dataCache) dataCache = { students: [], attendance: {} }; // Should be caught by parseError ideally
        if (!dataCache.students) dataCache.students = [];
        if (!dataCache.attendance) dataCache.attendance = {};

        console.log(`Data loaded: ${dataCache.students.length} students, ${Object.keys(dataCache.attendance).length} attendance dates.`);
        return dataCache;

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Data file not found (ENOENT). Creating default file.');
            dataCache = { students: [], attendance: {} };
            try {
                await saveData(dataCache); // Attempt to save the default structure right away
                console.log('Default data file created successfully.');
            } catch (saveError) {
                console.error('!!! CRITICAL: Failed to save default data file:', saveError);
                // Still return default structure so server can try to run
            }
        } else {
            console.error('!!! CRITICAL: Error reading data file:', error);
            console.log('!!! Returning default structure due to read error.');
            dataCache = { students: [], attendance: {} }; // Use default on other read errors
        }
        return dataCache; // Return default structure on any read error
    }
}

async function saveData(data) {
    const dataString = JSON.stringify(data, null, 2); // Pretty print JSON
    console.log("Attempting to save data to file:", DATA_FILE);
    // console.log("Data to save:", dataString); // Uncomment for detailed debug if needed
    try {
        await fs.writeFile(DATA_FILE, dataString, 'utf-8');
        dataCache = data; // Update cache *only after* successful save
        console.log("Data saved successfully to file.");
    } catch (error) {
        console.error('!!! CRITICAL: Error writing data file:', error);
        // Re-throw so the calling function knows it failed
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

// Get all students
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

// Add a student
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
        data.students.sort((a, b) => (a.roll_no || '').localeCompare(b.roll_no || '')); // Keep sorted, handle potential undefined roll_no

        await saveData(data); // Save the updated data
        console.log(`Student ${roll_no} added successfully.`);
        res.status(201).json(newStudent);

    } catch (error) {
        console.error('!!! Error in POST /api/students:', error);
        res.status(500).json({ message: error.message || "Error adding student." });
    }
     console.log(`<-- POST /api/students response sent.`);
});

// Remove a student
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
        // Also remove student from existing attendance records
        let attendanceChanged = false;
        Object.keys(data.attendance).forEach(date => {
            const initialAttLength = data.attendance[date].length;
            data.attendance[date] = data.attendance[date].filter(att => att.roll_no !== roll_no_to_delete);
            if (data.attendance[date].length < initialAttLength) {
                attendanceChanged = true;
            }
        });
         if (attendanceChanged) {
            console.log(`Removed attendance records for student ${roll_no_to_delete}.`);
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

// Get all attendance data (for frontend initial load)
app.get('/api/attendance', async (req, res) => {
    console.log(`--> GET /api/attendance request received at ${new Date().toISOString()}`);
    try {
        const data = await loadData();
        const attendanceData = data.attendance || {};
        console.log(`Sending attendance data for ${Object.keys(attendanceData).length} dates.`);
        // console.log("DEBUG: Sending /api/attendance response. Data:", JSON.stringify(attendanceData)); // Uncomment for detailed debug
        res.json(attendanceData);
    } catch (error) {
        console.error('!!! Error in GET /api/attendance:', error);
        res.status(500).json({ message: "Error loading attendance data." });
    }
    console.log(`<-- GET /api/attendance response sent.`);
});

// Get attendance for a specific date (for admin loading)
app.get('/api/attendance/:date', async (req, res) => {
    const date = req.params.date;
    console.log(`--> GET /api/attendance/${date} request received at ${new Date().toISOString()}`);
    try {
        // Basic date validation (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            console.log(`Validation failed: Invalid date format ${date}.`);
            return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
        }
        const data = await loadData();
        const dateData = data.attendance[date] || [];
        console.log(`Sending ${dateData.length} attendance records for date ${date}.`);
        res.json(dateData); // Return empty array if date not found
    } catch (error) {
        console.error(`!!! Error in GET /api/attendance/${date}:`, error);
        res.status(500).json({ message: "Error loading attendance data for the date." });
    }
     console.log(`<-- GET /api/attendance/${date} response sent.`);
});

// Save/Update attendance for a specific date
app.post('/api/attendance/:date', async (req, res) => {
    const date = req.params.date;
    console.log(`--> POST /api/attendance/${date} request received at ${new Date().toISOString()}`);
    console.log("Request body:", JSON.stringify(req.body)); // Log received data
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
             console.log(`Validation failed: Invalid date format ${date}.`);
             return res.status(400).json({ message: "Invalid date format. Use YNNN-MM-DD." });
        }
        const attendanceList = req.body; // Expecting an array of {roll_no, status}

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

        // Add student names to the saved data (optional, but good for print view)
        const enrichedAttendance = attendanceList.map(att => {
            const student = data.students.find(s => s.roll_no === att.roll_no);
            // Only include entries for students that actually exist in the student list
            if (student) {
                return { ...att, name: student.name };
            }
            return null; // Mark for filtering
        }).filter(Boolean); // Remove null entries if student didn't exist

        console.log(`Updating attendance for ${date} with ${enrichedAttendance.length} valid records.`);
        data.attendance[date] = enrichedAttendance; // Update the specific date
        await saveData(data); // Save the entire updated data object

        console.log(`Attendance for ${date} saved successfully.`);
        res.status(200).json({ message: `Attendance for ${date} saved successfully.` });

    } catch (error) {
        console.error(`!!! Error in POST /api/attendance/${date}:`, error);
        // Check if the error came from saveData
        if (error.message === 'Failed to save data to the server file.') {
             res.status(500).json({ message: "Server failed to save the attendance data file." });
        } else {
             res.status(500).json({ message: error.message || "Error saving attendance data." });
        }
    }
     console.log(`<-- POST /api/attendance/${date} response sent.`);
});

// Generate Printable HTML for a date
app.get('/admin/print/:date', async (req, res) => {
    const date = req.params.date;
    console.log(`--> GET /admin/print/${date} request received at ${new Date().toISOString()}`);
    try {
         if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
             console.log(`Validation failed: Invalid date format ${date}.`);
             return res.status(400).send("Invalid date format. Use YYYY-MM-DD.");
         }
        const data = await loadData();
        const attendanceList = data.attendance[date] || [];
        const presentStudents = attendanceList.filter(s => s.status === 'present');
        const totalStudents = data.students?.length || 0; // Handle case where students array might be missing

        console.log(`Generating print view for ${date}: ${presentStudents.length} present out of ${totalStudents} total students.`);

        // Simple HTML for printing (same as before)
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
                <h2>Present Students (${presentStudents.length} / ${totalStudents})</h2>
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
                ` : '<p style="text-align:center;">No students marked present for this date.</p>'}

                <div class="print-info">
                    <button onclick="window.print()">Print this page</button>
                </div>
            </body>
            </html>
        `;
        res.send(html);

    } catch (error) {
        console.error(`!!! Error in GET /admin/print/${date}:`, error);
        res.status(500).send("Error generating printable view.");
    }
     console.log(`<-- GET /admin/print/${date} response sent.`);
});


// --- Serving Static Files ---

// Serve the frontend from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the admin interface from 'admin' directory (added static serving)
// This allows admin.html to load relative assets if needed in the future
app.use('/admin', express.static(path.join(__dirname, 'admin')));
// Specific route for the admin HTML file itself
app.get('/admin', (req, res) => {
    console.log(`--> GET /admin request received (serving admin.html) at ${new Date().toISOString()}`);
    res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
     console.log(`<-- GET /admin response sent.`);
});

// Fallback for the frontend SPA (or just index.html)
// Handles refresh on any non-API, non-file path
app.get('*', (req, res) => {
  console.log(`--> GET /* fallback route requested for path: ${req.path} at ${new Date().toISOString()}`);
  // Check if the request looks like an API call or a file request first
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin/') || req.path.includes('.')) {
    // If it's an API call, admin path, or file request not handled above, let it 404
     console.log(`Path ${req.path} not handled, sending 404.`);
    res.status(404).send('Not Found');
  } else {
    // Otherwise, serve the main frontend page
    console.log(`Serving public/index.html as fallback for path: ${req.path}`);
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
   console.log(`<-- GET /* fallback response sent.`);
});


// --- Global Error Handlers ---
// Catch unhandled synchronous exceptions
process.on('uncaughtException', (error) => {
  console.error('!!! UNCAUGHT EXCEPTION:', error);
  // It's generally recommended to exit gracefully after an uncaught exception
  // process.exit(1); // Uncomment if you want the server to stop on such errors
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('!!! UNHANDLED REJECTION:', reason);
  // console.error('Promise:', promise); // Uncomment for more detail
});


// --- Start Server ---
app.listen(PORT, async () => {
    console.log(`Server starting on port ${PORT}...`);
    try {
        await loadData(); // Pre-load data on start and create file if needed
        console.log("Initial data load completed.");
    } catch (err) {
        console.error("!!! CRITICAL: Error during initial data load on startup:", err);
        // Server will still start, but might operate with default data
    }
    console.log(`Server listening on port ${PORT}`);
    console.log(`Frontend available at http://localhost:${PORT}`);
    console.log(`Admin available at http://localhost:${PORT}/admin`);
});
