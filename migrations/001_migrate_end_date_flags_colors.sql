-- Migration: Convert legacy badgeColor variant names to hex colors
-- Date: 2025-10-18
-- Purpose: Update end_date_flags table to use hex color codes instead of variant names

UPDATE end_date_flags 
SET badge_color = CASE 
  WHEN badge_color = 'destructive' THEN '#DC2626'
  WHEN badge_color = 'warning' THEN '#F97316'
  WHEN badge_color = 'secondary' THEN '#6B7280'
  WHEN badge_color = 'success' THEN '#10B981'
  WHEN badge_color = 'brown' THEN '#9A341E'
  WHEN badge_color = 'black' THEN '#000000'
  WHEN badge_color = 'yellow' THEN '#EAB308'
  WHEN badge_color = 'dark-yellow' THEN '#CA8A04'
  WHEN badge_color = 'blue' THEN '#3B82F6'
  WHEN badge_color = 'purple' THEN '#8B5CF6'
  ELSE badge_color
END
WHERE badge_color NOT LIKE '#%';
