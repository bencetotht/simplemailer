'use server';

const API_URL = 'http://localhost:3000/api';

export const getJobs = async () => {
  const response = await fetch(`${API_URL}/jobs`);
  const data = await response.json();
  return data;
}

export const getLogs = async () => {
  const response = await fetch(`${API_URL}/logs`);
  const data = await response.json();
  return data;
}

// // Default export for the entire API module
// export default {
//   getLogs
// };