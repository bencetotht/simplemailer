const API_URL = '/api';

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
