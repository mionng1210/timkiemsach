
/**
 * Test case for substring search issue.
 * Demonstrates that searching for a short code might return unexpected results.
 */

async function mockSearchByCode(code: string, allShelves: string[]) {
    console.log(`Searching for: "${code}"`);
    const pattern = `%${code.trim()}%`.toLowerCase();
    // Simplified regex to simulate SQL ILIKE %...%
    const regex = new RegExp(pattern.replace(/%/g, '.*'), 'i');
    const results = allShelves.filter(s => regex.test(s));
    console.log(`Results: [${results.join(', ')}]`);
}

const shelves = ['1a', '10a', '11a', '21a', '100a'];

console.log('--- Testing Substring Search ---');
mockSearchByCode('1a', shelves);
mockSearchByCode('10a', shelves);
