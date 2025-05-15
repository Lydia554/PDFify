import { formatDate } from './shared.js';

export const friendlyFieldsHtml = `
  <label>Customer Name: <input type="text" id="customerName" required></label><br>
  <label>Date: <input type="date" id="date" required></label><br>
  <label>Items (JSON array): <textarea id="items" rows="5" required>[{"name":"PDF Template","quantity":1,"price":"10.00"}]</textarea></label>
`;

export function collectFriendlyData() {
  const customerName = document.getElementById('customerName').value;
  const date = document.getElementById('date').value;
  const itemsJson = document.getElementById('items').value;
  let items;
  try {
    items = JSON.parse(itemsJson);
  } catch {
    alert('Invalid items JSON');
    return null;
  }
  return { customerName, date: formatDate(date), items };
}
