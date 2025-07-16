import { useQuery } from '@tanstack/react-query';
import {
	Box,
	Paper,
	Typography,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Chip,
	LinearProgress,
	Alert,
} from '@mui/material';
import { Psychology } from '@mui/icons-material';
import { apiClient } from '../services/api';

export default function LearnedPatterns() {
	const { data: patterns, isLoading } = useQuery({
		queryKey: ['learnedPatterns'],
		queryFn: async () => {
			const response = await apiClient.getLearnedPatterns();
			return response.data;
		},
	});

	if (isLoading) {
		return <LinearProgress />;
	}

	return (
		<Box>
			<Box display="flex" alignItems="center" gap={2} mb={3}>
				<Psychology color="primary" />
				<Typography variant="h4">Learned Vendor Patterns</Typography>
			</Box>

			<Alert severity="info" sx={{ mb: 3 }}>
				These are the patterns your system has learned from your categorizations. When new transactions match these patterns, they'll be automatically categorized.
			</Alert>

			{patterns?.learned_patterns?.length === 0 ? (
				<Paper sx={{ p: 3 }}>
					<Typography variant="body1" color="textSecondary" textAlign="center">
						No patterns learned yet. Start categorizing transactions to build your pattern library!
					</Typography>
				</Paper>
			) : (
				<TableContainer component={Paper}>
					<Table>
						<TableHead>
							<TableRow>
								<TableCell>Vendor Name</TableCell>
								<TableCell>Category</TableCell>
								<TableCell>Learned Patterns</TableCell>
								<TableCell>Confidence</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{patterns?.learned_patterns && Array.isArray(patterns.learned_patterns) ? patterns.learned_patterns.map((pattern: any) => (
								<TableRow key={pattern.vendor_id}>
									<TableCell>
										<Typography variant="body1" fontWeight="medium">
											{pattern.vendor_name}
										</Typography>
									</TableCell>
									<TableCell>
										<Chip
											label={pattern.category_name || 'No category'}
											color="primary"
											size="small"
										/>
									</TableCell>
									<TableCell>
										<Box display="flex" flexWrap="wrap" gap={1}>
											{pattern.patterns && Array.isArray(pattern.patterns) ? pattern.patterns.map((p: string, index: number) => (
												<Chip
													key={index}
													label={p}
													variant="outlined"
													size="small"
													sx={{ fontFamily: 'monospace' }}
												/>
											)) : null}
										</Box>
									</TableCell>
									<TableCell>
										<Chip
											label={`${(pattern.confidence_threshold * 100).toFixed(0)}%`}
											color={pattern.confidence_threshold > 0.8 ? 'success' : 'warning'}
											size="small"
										/>
									</TableCell>
								</TableRow>
							)) : null}
						</TableBody>
					</Table>
				</TableContainer>
			)}

			<Paper sx={{ p: 2, mt: 3 }}>
				<Typography variant="h6" gutterBottom>
					How Pattern Learning Works
				</Typography>
				<Typography variant="body2" paragraph>
					When you categorize a transaction, the system normalizes the description by:
				</Typography>
				<Box component="ul" sx={{ pl: 3 }}>
					<Typography component="li" variant="body2">Converting to UPPERCASE</Typography>
					<Typography component="li" variant="body2">Removing numbers (1234 → "")</Typography>
					<Typography component="li" variant="body2">Removing special characters (!@#$% → "")</Typography>
					<Typography component="li" variant="body2">Removing spaces</Typography>
				</Box>
				<Typography variant="body2" sx={{ mt: 1 }}>
					Example: "COOP-2238 WINT. ST" becomes "COOPWINTST"
				</Typography>
			</Paper>
		</Box>
	);
}