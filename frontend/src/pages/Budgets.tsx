import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Box,
	Paper,
	Typography,
	Grid,
	Card,
	CardContent,
	TextField,
	Button,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	LinearProgress,
	Chip,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format, startOfMonth } from 'date-fns';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

export default function Budgets() {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const [selectedPeriod, setSelectedPeriod] = useState(startOfMonth(new Date()));
	const [budgetAmounts, setBudgetAmounts] = useState<Record<string, string>>({});

	const { data: budget, isLoading } = useQuery({
		queryKey: ['currentBudget'],
		queryFn: async () => {
			const response = await apiClient.getCurrentBudget();
			return response.data;
		},
	});

	const { data: categories } = useQuery({
		queryKey: ['categories'],
		queryFn: async () => {
			const response = await apiClient.getCategories();
			return response.data;
		},
	});

	const updateBudgetMutation = useMutation({
		mutationFn: async ({ categoryId, amount }: any) => {
			return apiClient.createOrUpdateBudget(
				selectedPeriod.toISOString().split('T')[0],
				categoryId,
				parseFloat(amount)
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['currentBudget'] });
			enqueueSnackbar('Budget updated successfully', { variant: 'success' });
		},
	});

	const handleBudgetUpdate = (categoryId: string) => {
		const amount = budgetAmounts[categoryId];
		if (amount && parseFloat(amount) > 0) {
			updateBudgetMutation.mutate({ categoryId, amount });
		}
	};

	return (
		<Box>
			<Typography variant="h4" gutterBottom>
				Budget Management
			</Typography>

			<Grid container spacing={3}>
				<Grid item xs={12} md={8}>
					<Paper sx={{ p: 3 }}>
						<Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
							<Typography variant="h6">Budget Allocation</Typography>
							<DatePicker
								label="Budget Period"
								value={selectedPeriod}
								onChange={(date) => setSelectedPeriod(date || new Date())}
								views={['year', 'month']}
								slotProps={{ textField: { size: 'small' } }}
							/>
						</Box>

						<TableContainer>
							<Table>
								<TableHead>
									<TableRow>
										<TableCell>Category</TableCell>
										<TableCell>Type</TableCell>
										<TableCell align="right">Budget Amount</TableCell>
										<TableCell align="center">Action</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{categories?.map((category: any) => (
										<TableRow key={category.id}>
											<TableCell>{category.name}</TableCell>
											<TableCell>
												{category.is_savings && (
													<Chip label="Savings" color="primary" size="small" />
												)}
												{category.is_automatic_deduction && (
													<Chip label="Automatic" color="secondary" size="small" />
												)}
												{!category.is_savings && !category.is_automatic_deduction && (
													<Chip label="Regular" size="small" />
												)}
											</TableCell>
											<TableCell align="right">
												<TextField
													type="number"
													size="small"
													value={budgetAmounts[category.id] || ''}
													onChange={(e) =>
														setBudgetAmounts({
															...budgetAmounts,
															[category.id]: e.target.value,
														})
													}
													placeholder="0.00"
													sx={{ width: 120 }}
												/>
											</TableCell>
											<TableCell align="center">
												<Button
													size="small"
													onClick={() => handleBudgetUpdate(category.id)}
													disabled={!budgetAmounts[category.id]}>
													Update
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</TableContainer>
					</Paper>
				</Grid>

				<Grid item xs={12} md={4}>
					<Card>
						<CardContent>
							<Typography variant="h6" gutterBottom>
								Current Month Summary
							</Typography>
							{budget && (
								<>
									<Box sx={{ mb: 2 }}>
										<Typography variant="body2" color="textSecondary">
											Total Budget
										</Typography>
										<Typography variant="h5">${budget.total_budgeted.toFixed(2)}</Typography>
									</Box>
									<Box sx={{ mb: 2 }}>
										<Typography variant="body2" color="textSecondary">
											Total Spent
										</Typography>
										<Typography variant="h5">${budget.total_spent.toFixed(2)}</Typography>
									</Box>
									<Box sx={{ mb: 2 }}>
										<Typography variant="body2" color="textSecondary">
											Remaining
										</Typography>
										<Typography variant="h5">
											${(budget.total_budgeted - budget.total_spent).toFixed(2)}
										</Typography>
									</Box>
									<LinearProgress
										variant="determinate"
										value={(budget.total_spent / budget.total_budgeted) * 100}
										sx={{ mb: 1 }}
									/>
									<Typography variant="body2" color="textSecondary">
										{((budget.total_spent / budget.total_budgeted) * 100).toFixed(1)}% used
									</Typography>
								</>
							)}
						</CardContent>
					</Card>
				</Grid>
			</Grid>
		</Box>
	);
}
