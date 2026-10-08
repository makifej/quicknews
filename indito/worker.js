// quicknews.hu indító: negyedóránként elindítja a GitHub Actions frissítést.
// Éjjel (23:00 és 08:00 között, magyar idő) nem indít. A GH_TOKEN titok egy
// szűk jogú GitHub-token, ami csak ezt az egy workflow-t tudja elindítani.

const REPO = "makifej/quicknews";
const WORKFLOW = "frissites.yml";

function budapestiOra(d) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Budapest", hour: "2-digit", hour12: false }).format(d));
}

async function indit(env) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GH_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "quicknews-indito",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  return { status: r.status, body: r.status === 204 ? "elindítva" : await r.text() };
}

export default {
  async scheduled(event, env, ctx) {
    const ora = budapestiOra(new Date(event.scheduledTime));
    if (ora >= 23 || ora < 8) {
      console.log(`éjszaka (${ora} óra), nem indítok`);
      return;
    }
    const v = await indit(env);
    console.log(JSON.stringify(v));
    if (v.status !== 204) throw new Error(`GitHub ${v.status}: ${v.body}`);
  },
  async fetch() {
    return new Response("quicknews indító fut", { status: 200 });
  },
};
