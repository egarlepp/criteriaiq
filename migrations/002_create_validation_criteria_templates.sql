-- Migration: Create Validation Criteria Templates tables
-- Description: Add tables for storing validation criteria templates and their hierarchical links

-- Create validation_criteria_templates table
CREATE TABLE IF NOT EXISTS validation_criteria_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100) DEFAULT 'LayoutTemplate',
  root_solution_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  is_starred BOOLEAN DEFAULT FALSE,
  created_by VARCHAR REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create validation_criteria_template_links table
CREATE TABLE IF NOT EXISTS validation_criteria_template_links (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES validation_criteria_templates(id) ON DELETE CASCADE NOT NULL,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  link_type VARCHAR(50) NOT NULL CHECK (link_type IN ('solution-criteria', 'criteria-outcome', 'outcome-action')),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_template_link UNIQUE (template_id, from_id, to_id, link_type)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_vcrit_templates_created_by ON validation_criteria_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_vcrit_templates_starred ON validation_criteria_templates(is_starred);
CREATE INDEX IF NOT EXISTS idx_vcrit_template_links_template ON validation_criteria_template_links(template_id);
CREATE INDEX IF NOT EXISTS idx_vcrit_template_links_from ON validation_criteria_template_links(from_id);
CREATE INDEX IF NOT EXISTS idx_vcrit_template_links_to ON validation_criteria_template_links(to_id);
