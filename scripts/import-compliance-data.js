#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the storage module
import { storage } from '../server/storage.js';

/**
 * Parse CSV data into array of objects
 * @param {string} csvText - The CSV file content
 * @returns {Array} Array of objects representing each row
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(header => header.replace(/"/g, '').trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim()); // Add the last value
    
    const row = {};
    headers.forEach((header, index) => {
      let value = values[index] || '';
      // Remove surrounding quotes if present
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      row[header] = value;
    });
    rows.push(row);
  }
  
  return rows;
}

/**
 * Convert CSV row to compliance regulation object
 * @param {Object} row - CSV row object
 * @returns {Object} Compliance regulation object
 */
function mapCSVRowToRegulation(row) {
  return {
    name: row.name,
    longName: row.longName,
    category: row.category,
    description: row.description,
    industry: row.industry,
    objective: row.objective,
    priority: row.priority,
    status: row.status,
    applicableRegions: row.applicableRegions,
    keyRequirements: row.keyRequirements,
  };
}

/**
 * Main import function
 */
async function importComplianceData() {
  try {
    console.log('🚀 Starting compliance regulations import...');
    
    // Read CSV file
    const csvPath = path.join(__dirname, 'compliance_regulations_seed.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    
    console.log('📄 CSV file loaded successfully');
    
    // Parse CSV
    const csvRows = parseCSV(csvContent);
    console.log(`📊 Parsed ${csvRows.length} regulations from CSV`);
    
    // Check for existing regulations to avoid duplicates
    const existingRegulations = await storage.getComplianceRegulations();
    const existingNames = new Set(existingRegulations.map(reg => reg.name));
    
    console.log(`🔍 Found ${existingRegulations.length} existing regulations in database`);
    
    // Filter out duplicates
    const newRegulations = csvRows.filter(row => !existingNames.has(row.name));
    
    if (newRegulations.length === 0) {
      console.log('✅ No new regulations to import. All regulations already exist in database.');
      return;
    }
    
    console.log(`📥 Importing ${newRegulations.length} new regulations...`);
    
    // Import new regulations
    let importCount = 0;
    for (const row of newRegulations) {
      try {
        const regulationData = mapCSVRowToRegulation(row);
        await storage.createComplianceRegulation(regulationData);
        importCount++;
        console.log(`✓ Imported: ${regulationData.name}`);
      } catch (error) {
        console.error(`❌ Failed to import ${row.name}:`, error.message);
      }
    }
    
    console.log(`🎉 Import completed! Successfully imported ${importCount} compliance regulations.`);
    
    // Display summary
    const totalRegulations = await storage.getComplianceRegulations();
    console.log(`📈 Total regulations in database: ${totalRegulations.length}`);
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

// Run the import if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  importComplianceData().catch(console.error);
}

export { importComplianceData };