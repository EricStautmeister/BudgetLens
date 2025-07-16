// Test the intelligent vendor suggestions in browser console
// Copy and paste this into the browser console when on the Review page

async function testIntelligentVendorSuggestions() {
    console.log('Testing Intelligent Vendor Suggestions...');

    const testDescriptions = [
        "KKIOSK Deutweg Zurich",
        "kkiosk zürich hauptbahnhof",
        "Migros Bahnhofstrasse 123 Zurich",
        "Coop City Center Downtown"
    ];

    for (const description of testDescriptions) {
        console.log(`\n--- Testing: "${description}" ---`);

        try {
            // Test the new comprehensive suggestion endpoint
            const response = await fetch('/api/v1/vendors/comprehensive-suggestion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ description })
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Success!');
                console.log('Extracted vendor:', data.analysis.extracted_vendor_text);
                console.log('Suggested name:', data.analysis.suggested_new_vendor_name);
                console.log('Should create new:', data.analysis.should_create_new);
                console.log('Top n-grams:', data.analysis.top_ngrams?.slice(0, 3));
                console.log('Existing matches:', data.analysis.existing_vendor_matches?.length || 0);

                if (data.analysis.hierarchy_analysis?.can_join_existing_group) {
                    console.log('🔗 Can join group:', data.analysis.hierarchy_analysis.suggested_parent);
                }
            } else {
                console.log('❌ Error:', response.status, await response.text());
            }
        } catch (error) {
            console.log('❌ Exception:', error.message);
        }
    }

    console.log('\n✅ Testing completed!');
}

// Also test the basic vendor suggestions endpoint for comparison
async function testBasicVendorSuggestions() {
    console.log('\n--- Testing Basic Vendor Suggestions ---');

    try {
        const response = await fetch('/api/v1/vendors/suggest?description=KKIOSK%20Deutweg%20Zurich&limit=5', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Basic suggestions:', data);
        } else {
            console.log('❌ Error:', response.status, await response.text());
        }
    } catch (error) {
        console.log('❌ Exception:', error.message);
    }
}

// Run the tests
console.log('🚀 Starting Vendor Intelligence Tests...');
console.log('Make sure you are logged in and on the Review page.');
console.log('Run: testIntelligentVendorSuggestions()');
console.log('Run: testBasicVendorSuggestions()');
