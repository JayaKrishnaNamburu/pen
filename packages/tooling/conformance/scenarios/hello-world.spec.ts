import { scenario } from "../src/scenario";

scenario("S2 hello-world: type a character and match authority", async (s) => {
	await s.load("hello-world");
	await s.keyboard.type("!");
	await s.assert.textContains("Hello");
	await s.assert.textContains("!");
	await s.assert.domMatchesAuthority();
});
