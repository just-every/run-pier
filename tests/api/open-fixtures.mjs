export async function openJourney(h) {
  for (const warehouse of ['Dallas', 'Austin', 'Houston']) await h.command('location.save', { name: `${warehouse} receiving`, warehouse, kind: 'bin' });
  for (let index = 1; index <= 25; index++) {
    const response = await h.request('/auth/invite', { method: 'POST', body: { email: `staff${index}@example.test`, displayName: `Warehouse colleague ${index}`, role: 'member' } });
    if (response.status !== 202) throw new Error(`Staff invitation ${index} refused: ${response.status}`);
  }
}
