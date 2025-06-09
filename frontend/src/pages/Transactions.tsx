import React, { useState } from 'react';
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
	TablePagination,
	Chip,
	TextField,
	Grid,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format } from 'date-fns';
import { apiClient } from '../services/api';

export default function Transactions() {
	const [page, setPage] = useState(0);
	const [rowsPerPage, setRowsPerPage] = useState(25);
	const [filters, setFilters] = useState({
		start_date: null,
		end_date: null,
		category_id: '',
		needs_review: '',
	});

	const { data: transactions, isLoading } = useQuery({
		queryKey: ['transactions', page, rowsPerPage, filters],
		queryFn: async () => {
			const response = await apiClient.getTransactions({
				skip: page * rowsPerPage,
				limit: rowsPerPage,
				...filters,
			});
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

	const handleChangePage = (event: unknown, newPage: number) => {
		setPage(newPage);
	};

	const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
		setRowsPerPage(parseInt(event.target.value, 10));
		setPage(0);
	};

	return (
		<Box>
			<Typography variant="h4" gutterBottom>
				Transactions
			</Typography>

			<Paper sx={{ p: 2, mb: 2 }}>
				<Grid container spacing={2}>
					<Grid item xs={12} md={3}>
						<DatePicker
							label="Start Date"
							value={filters.start_date}
							onChange={(date) => setFilters({ ...filters, start_date: date })}
							slotProps={{ textField: { fullWidth: true } }}
						/>
					</Grid>
					<Grid item xs={12} md={3}>
						<DatePicker
							label="End Date"
							value={filters.end_date}
							onChange={(date) => setFilters({ ...filters, end_date: date })}
							slotProps={{ textField: { fullWidth: true } }}
						/>
					</Grid>
					<Grid item xs={12} md={3}>
						<FormControl fullWidth>
							<InputLabel>Category</InputLabel>
							<Select
								value={filters.category_id}
								onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}
								label="Category">
								<MenuItem value="">All</MenuItem>
								{categories?.map((cat: any) => (
									<MenuItem key={cat.id} value={cat.id}>
										{cat.name}
									</MenuItem>
								))}
							</Select>
						</FormControl>
					</Grid>
					<Grid item xs={12} md={3}>
						<FormControl fullWidth>
							<InputLabel>Review Status</InputLabel>
							<Select
								value={filters.needs_review}
								onChange={(e) => setFilters({ ...filters, needs_review: e.target.value })}
								label="Review Status">
								<MenuItem value="">All</MenuItem>
								<MenuItem value="true">Needs Review</MenuItem>
								<MenuItem value="false">Reviewed</MenuItem>
							</Select>
						</FormControl>
					</Grid>
				</Grid>
			</Paper>

			<TableContainer component={Paper}>
				<Table>
					<TableHead>
						<TableRow>
							<TableCell>Date</TableCell>
							<TableCell>Description</TableCell>
							<TableCell>Category</TableCell>
							<TableCell>Vendor</TableCell>
							<TableCell align="right">Amount</TableCell>
							<TableCell>Status</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{transactions?.map((transaction: any) => (
							<TableRow key={transaction.id}>
								<TableCell>{format(new Date(transaction.date), 'MMM dd, yyyy')}</TableCell>
								<TableCell>{transaction.description}</TableCell>
								<TableCell>{transaction.category_name || '-'}</TableCell>
								<TableCell>{transaction.vendor_name || '-'}</TableCell>
								<TableCell align="right">
									${Math.abs(transaction.amount).toFixed(2)}
									{transaction.amount < 0 && <Chip label="Debit" size="small" sx={{ ml: 1 }} />}
								</TableCell>
								<TableCell>
									{transaction.needs_review ? (
										<Chip label="Needs Review" color="warning" size="small" />
									) : (
										<Chip label="Categorized" color="success" size="small" />
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<TablePagination
					rowsPerPageOptions={[25, 50, 100]}
					component="div"
					count={-1}
					rowsPerPage={rowsPerPage}
					page={page}
					onPageChange={handleChangePage}
					onRowsPerPageChange={handleChangeRowsPerPage}
				/>
			</TableContainer>
		</Box>
	);
}
