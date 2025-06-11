import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	Box,
	Paper,
	Typography,
	TextField,
	Button,
	Alert,
	Chip,
} from '@mui/material';
import { BugReport } from '@mui/icons-material';
import { apiClient } from '../services/api';

export default function VendorPatternTest() {
	const [testDescription, setTestDescription] = useState('');
	const [shouldFetch, setShouldFetch] = useState(false);

	const { data: debugInfo, isLoading } = useQuery({
		queryKey: ['debugVendorExtraction', testDescription],
		queryFn: async () => {
			if (!testDescription.trim()) return null;
			const response = await apiClient.debugVendorExtraction(testDescription);
			return response.data;
		},
		enabled: shouldFetch && !!testDescription.trim(),
	});

	const handleTest = () => {
		if (testDescription.trim()) {
			setShouldFetch(true);
		}
	};

	const exampleTransactions = [
		"Purchase ZKB Visa Debit card no. xxxx 7693, Lidl Zuerich 0800 Zuerich",
		"Purchase ZKB Visa Debit card no. xxxx 1234, COOP-2238 WINT. ST",
		"Ihre Zahlung",
		"TWINT Payment, Migros Bahnhofstrasse 123",
		"Apple Pay Payment, Starbucks Coffee Zurich HB"
	];

	return (
		<Box>
			<Box display="flex" alignItems="center" gap={2} mb={3}>
				<BugReport color="primary" />
				<Typography variant="h4">Vendor Pattern Test</Typography>
			</Box>

			<Alert severity="info" sx={{ mb: 3 }}>
				Test how the system extracts vendors from transaction descriptions and creates patterns for matching.
			</Alert>

			<Paper sx={{ p: 3, mb: 3 }}>
				<Typography variant="h6" gutterBottom>
					Test Transaction Description
				</Typography>
				
				<TextField
					fullWidth
					multiline
					rows={2}
					label="Enter transaction description"
					value={testDescription}
					onChange={(e) => {
						setTestDescription(e.target.value);
						setShouldFetch(false); // Reset fetch trigger
					}}
					placeholder="e.g., Purchase ZKB Visa Debit card no. xxxx 7693, Lidl Zuerich 0800 Zuerich"
					sx={{ mb: 2 }}
				/>
				
				<Button 
					variant="contained" 
					onClick={handleTest}
					disabled={!testDescription.trim() || isLoading}
				>
					{isLoading ? 'Analyzing...' : 'Test Pattern Extraction'}
				</Button>
			</Paper>

			{debugInfo && (
				<Paper sx={{ p: 3, mb: 3 }}>
					<Typography variant="h6" gutterBottom>
						Analysis Results
					</Typography>
					
					<Box sx={{ mb: 2 }}>
						<Typography variant="subtitle2" color="textSecondary">
							Original Description:
						</Typography>
						<Typography variant="body1" sx={{ fontFamily: 'monospace', bgcolor: 'grey.100', p: 1, borderRadius: 1 }}>
							{debugInfo.original_description}
						</Typography>
					</Box>

					<Box sx={{ mb: 2 }}>
						<Typography variant="subtitle2" color="textSecondary">
							Extracted Vendor:
						</Typography>
						<Typography variant="body1" sx={{ fontFamily: 'monospace', bgcolor: 'success.50', p: 1, borderRadius: 1 }}>
							{debugInfo.extracted_vendor}
						</Typography>
					</Box>

					<Box sx={{ mb: 2 }}>
						<Typography variant="subtitle2" color="textSecondary">
							Normalized Pattern:
						</Typography>
						<Chip 
							label={debugInfo.normalized_pattern} 
							color="primary" 
							sx={{ fontFamily: 'monospace', fontSize: '14px' }}
						/>
					</Box>

					{debugInfo.suggestions && debugInfo.suggestions.length > 0 && (
						<Box sx={{ mb: 2 }}>
							<Typography variant="subtitle2" color="textSecondary" gutterBottom>
								Similar Existing Vendors:
							</Typography>
							{debugInfo.suggestions.map((suggestion: any, index: number) => (
								<Box key={index} sx={{ mb: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
									<Box display="flex" justifyContent="space-between" alignItems="center">
										<Typography variant="body2">
											<strong>{suggestion.vendor_name}</strong> (Pattern: {suggestion.matching_pattern})
										</Typography>
										<Chip 
											label={`${(suggestion.similarity * 100).toFixed(0)}% match`}
											size="small"
											color={suggestion.similarity > 0.8 ? 'success' : 'warning'}
										/>
									</Box>
								</Box>
							))}
						</Box>
					)}

					{(!debugInfo.suggestions || debugInfo.suggestions.length === 0) && (
						<Alert severity="info">
							No similar vendors found. This would create a new vendor pattern.
						</Alert>
					)}
				</Paper>
			)}

			<Paper sx={{ p: 3 }}>
				<Typography variant="h6" gutterBottom>
					Example Transactions
				</Typography>
				<Typography variant="body2" color="textSecondary" gutterBottom>
					Click any example to test it:
				</Typography>
				
				{exampleTransactions.map((example, index) => (
					<Box key={index} sx={{ mb: 1 }}>
						<Button
							variant="outlined"
							size="small"
							onClick={() => {
								setTestDescription(example);
								setShouldFetch(false);
							}}
							sx={{ 
								justifyContent: 'flex-start',
								textAlign: 'left',
								width: '100%',
								fontFamily: 'monospace',
								textTransform: 'none'
							}}
						>
							{example}
						</Button>
					</Box>
				))}
			</Paper>

			<Paper sx={{ p: 3, mt: 3 }}>
				<Typography variant="h6" gutterBottom>
					How It Works
				</Typography>
				<Box component="ol" sx={{ pl: 3 }}>
					<Typography component="li" variant="body2" paragraph>
						<strong>Extract Vendor:</strong> Everything after the first comma is considered the vendor/merchant
					</Typography>
					<Typography component="li" variant="body2" paragraph>
						<strong>Normalize:</strong> Remove numbers, special characters, and location words
					</Typography>
					<Typography component="li" variant="body2" paragraph>
						<strong>Pattern Match:</strong> Compare normalized patterns to find similar vendors
					</Typography>
					<Typography component="li" variant="body2" paragraph>
						<strong>Auto-categorize:</strong> New transactions matching the pattern get auto-categorized
					</Typography>
				</Box>
			</Paper>
		</Box>
	);
}