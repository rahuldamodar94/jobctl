// Common location choices shown as tappable chips in onboarding + Settings.
// Matched as case-insensitive substrings against job locations, so the loader
// lowercases them — display casing here is purely cosmetic. Single source of
// truth so the two pickers never drift apart again.
export const COMMON_LOCATIONS = [
  'Remote', 'EMEA', 'United States', 'Europe', 'United Kingdom', 'India',
  'Bangalore', 'Hyderabad', 'Mumbai', 'London', 'Berlin', 'New York',
  'San Francisco', 'Dubai', 'MENA', 'Singapore', 'Malaysia', 'Canada',
  'Germany', 'Netherlands', 'Australia',
];
