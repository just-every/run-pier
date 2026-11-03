// Zone names are retained on released pick lines: changing a bin's catalogue
// metadata later must not silently move an interrupted task to another team.
type PickWave = { pickMode?: string; lines: any[] };

export function zoneGroups(wave: PickWave, orderId?: string) {
  if (wave.pickMode !== 'zone') return [];
  const lines = wave.lines.filter(line => !orderId || line.orderId === orderId);
  return [...new Set<string>(lines.map(line => line.zone))].map(name => {
    const own = lines.filter(line => line.zone === name);
    return { name, lines: own.length, linesOpen: own.filter(line => line.status === 'open').length };
  });
}
