async function test() {
  for (let i = 0; i < 3; i++) {
    const res = await fetch('http://localhost:3000/api/executive/briefing?dynamic=true&forceChanged=true');
    const data = await res.json();
    console.log(`\n=== RUN ${i + 1} ===`);
    console.log(data.text);
    console.log('Cues:', data.cues.map(c => `[t=${c.timeOffset}s | step=${c.step} | ${c.target} | ${c.stepTitle}]`));
    await new Promise(r => setTimeout(r, 1000));
  }
}
test().catch(console.error);
