// frontend/src/pages/Transactions.tsx - Updated with account filtering and assignment

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    Grid,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Button,
    Checkbox,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    Tooltip,
    TextField,
    InputAdornment,
    IconButton,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import {
    AccountBalance as AccountIcon,
    SwapHoriz,
    Assignment,
    FilterList,
    Search,
    Edit,
    Clear,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';
import TransactionEditDialog from '../components/TransactionEditDialog';

// Utility function to ensure we always have an array
const ensureArray = (data: any): any[] => {
    if (Array.isArray(data)) {
        return data;
    }
    if (data === null || data === undefined) {
        return [];
    }
    if (typeof data === 'object') {
        // Check common array property names
        if (Array.isArray(data.items)) return data.items;
        if (Array.isArray(data.results)) return data.results;
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.transactions)) return data.transactions;
        if (Array.isArray(data.categories)) return data.categories;
        if (Array.isArray(data.accounts)) return data.accounts;
    }
    console.warn('Could not convert to array:', data, typeof data);
    return [];
};

export default function Transactions() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [filters, setFilters] = useState({
        start_date: null,
        end_date: null,
        category_id: '',
        account_id: '', // NEW: Account filter
        needs_review: '',
        exclude_transfers: false, // NEW: Exclude transfers option
        search: '', // NEW: Search filter
    });
    const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
    const [assignAccountDialog, setAssignAccountDialog] = useState(false);
    const [selectedAccountForAssignment, setSelectedAccountForAssignment] = useState('');
    const [editDialog, setEditDialog] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<any>(null);

    const { data: transactions } = useQuery({
        queryKey: ['transactions', page, rowsPerPage, filters],
        queryFn: async () => {
            try {
                const response = await apiClient.getTransactionsWithAccountFilter({
                    skip: page * rowsPerPage,
                    limit: rowsPerPage,
                    ...filters,
                });
                console.log('Transactions API response:', response.data);
                return ensureArray(response.data);
            } catch (error) {
                console.error('Error fetching transactions:', error);
                return [];
            }
        },
    });

    const { data: categories } = useQuery({
        queryKey: ['categories'],
        queryFn: async () => {
            try {
                const response = await apiClient.getCategories();
                return ensureArray(response.data);
            } catch (error) {
                console.error('Error fetching categories:', error);
                return [];
            }
        },
    });

    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: async () => {
            try {
                const response = await apiClient.getAccounts();
                return ensureArray(response.data);
            } catch (error) {
                console.error('Error fetching accounts:', error);
                return [];
            }
        },
    });

    const { data: unassignedTransactions } = useQuery({
        queryKey: ['unassignedTransactions'],
        queryFn: async () => {
            try {
                const response = await apiClient.getUnassignedTransactions(50);
                return ensureArray(response.data);
            } catch (error) {
                console.error('Error fetching unassigned transactions:', error);
                return [];
            }
        },
    });

    const bulkAssignMutation = useMutation({
        mutationFn: async ({ transactionIds, accountId }: { transactionIds: string[]; accountId: string }) => {
            return apiClient.bulkAssignAccount(transactionIds, accountId);
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['unassignedTransactions'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            enqueueSnackbar(`Assigned ${data.data.updated_count} transactions to ${data.data.account_name}`, {
                variant: 'success'
            });
            setSelectedTransactions([]);
            setAssignAccountDialog(false);
        },
        onError: (error: any) => {
            enqueueSnackbar(error.response?.data?.detail || 'Assignment failed', { variant: 'error' });
        },
    });

    const autoAssignMutation = useMutation({
        mutationFn: async () => {
            return apiClient.autoAssignAccounts();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['unassignedTransactions'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            enqueueSnackbar(data.data.message, { variant: 'success' });
        },
        onError: (error: any) => {
            enqueueSnackbar(error.response?.data?.detail || 'Auto-assignment failed', { variant: 'error' });
        },
    });

    const handleChangePage = (_event: React.MouseEvent<HTMLButtonElement, MouseEvent> | null, newPage: number) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const handleSelectTransaction = (transactionId: string) => {
        setSelectedTransactions(prev =>
            prev.includes(transactionId)
                ? prev.filter(id => id !== transactionId)
                : [...prev, transactionId]
        );
    };

    const handleSelectAll = () => {
        const transactionsList = ensureArray(transactions);
        if (selectedTransactions.length === transactionsList.length) {
            setSelectedTransactions([]);
        } else {
            setSelectedTransactions(transactionsList.map((t: any) => t.id) || []);
        }
    };

    const handleBulkAssign = () => {
        if (selectedTransactions.length > 0 && selectedAccountForAssignment) {
            bulkAssignMutation.mutate({
                transactionIds: selectedTransactions,
                accountId: selectedAccountForAssignment,
            });
        }
    };

    const handleEditTransaction = (transaction: any) => {
        setEditingTransaction(transaction);
        setEditDialog(true);
    };

    const handleCloseEditDialog = () => {
        setEditDialog(false);
        setEditingTransaction(null);
    };

    const clearSearch = () => {
        setFilters({ ...filters, search: '' });
    };

    const getAccountChip = (transaction: any) => {
        if (!transaction.account_name) {
            return <Chip label="Unassigned" color="warning" size="small" />;
        }

        const colorMap: Record<string, any> = {
            checking: 'primary',
            savings: 'success',
            credit_card: 'warning',
            investment: 'info',
            loan: 'error',
        };

        return (
            <Chip
                label={transaction.account_name}
                color={colorMap[transaction.account_type] || 'default'}
                size="small"
                icon={<AccountIcon fontSize="small" />}
            />
        );
    };

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h4">Transactions</Typography>
                <Box display="flex" gap={2}>
                    {selectedTransactions.length > 0 && (
                        <>
                            <Button
                                variant="outlined"
                                startIcon={<Assignment />}
                                onClick={() => setAssignAccountDialog(true)}>
                                Assign Account ({selectedTransactions.length})
                            </Button>
                            {selectedTransactions.length === 1 && (
                                <Button
                                    variant="outlined"
                                    startIcon={<Edit />}
                                    onClick={() => {
                                        const transaction = transactions?.find((t: any) => t.id === selectedTransactions[0]);
                                        if (transaction) handleEditTransaction(transaction);
                                    }}>
                                    Edit Transaction
                                </Button>
                            )}
                        </>
                    )}
                    {unassignedTransactions && unassignedTransactions.length > 0 && (
                        <Button
                            variant="contained"
                            startIcon={<AccountIcon />}
                            onClick={() => autoAssignMutation.mutate()}
                            disabled={autoAssignMutation.isPending}>
                            Auto-Assign Unassigned ({unassignedTransactions.length})
                        </Button>
                    )}
                </Box>
            </Box>

            {/* Unassigned Transactions Alert */}
            {unassignedTransactions && unassignedTransactions.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                        You have {unassignedTransactions.length} transactions that haven't been assigned to an account.
                        Use the "Auto-Assign" button or manually assign them using the checkbox selection.
                    </Typography>
                </Alert>
            )}

            {/* Filters */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <FilterList color="primary" />
                    <Typography variant="h6">Filters</Typography>
                </Box>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={3}>
                        <TextField
                            fullWidth
                            size="small"
                            label="Search transactions"
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search />
                                    </InputAdornment>
                                ),
                                endAdornment: filters.search && (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={clearSearch}>
                                            <Clear />
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }}
                            placeholder="Search descriptions, details, references..."
                        />
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <DatePicker
                            label="Start Date"
                            value={filters.start_date}
                            onChange={(date) => setFilters({ ...filters, start_date: date })}
                            slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <DatePicker
                            label="End Date"
                            value={filters.end_date}
                            onChange={(date) => setFilters({ ...filters, end_date: date })}
                            slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Account</InputLabel>
                            <Select
                                value={filters.account_id}
                                onChange={(e) => setFilters({ ...filters, account_id: e.target.value })}
                                label="Account">
                                <MenuItem value="">All Accounts</MenuItem>
                                {ensureArray(accounts).map((account: any) => (
                                    <MenuItem key={account.id} value={account.id}>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <AccountIcon fontSize="small" />
                                            {account.name}
                                        </Box>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Category</InputLabel>
                            <Select
                                value={filters.category_id}
                                onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}
                                label="Category">
                                <MenuItem value="">All Categories</MenuItem>
                                {ensureArray(categories).map((cat: any) => (
                                    <MenuItem key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <FormControl fullWidth size="small">
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
                    <Grid item xs={12} md={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Transfers</InputLabel>
                            <Select
                                value={filters.exclude_transfers ? 'exclude' : 'include'}
                                onChange={(e) => setFilters({ ...filters, exclude_transfers: e.target.value === 'exclude' })}
                                label="Transfers">
                                <MenuItem value="include">Include Transfers</MenuItem>
                                <MenuItem value="exclude">
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <SwapHoriz fontSize="small" />
                                        Exclude Transfers
                                    </Box>
                                </MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                </Grid>
            </Paper>

            {/* Transactions Table */}
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    checked={selectedTransactions.length === transactions?.length && transactions?.length > 0}
                                    indeterminate={selectedTransactions.length > 0 && selectedTransactions.length < (transactions?.length || 0)}
                                    onChange={handleSelectAll}
                                />
                            </TableCell>
                            <TableCell>Date</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell>Account</TableCell>
                            <TableCell>Category</TableCell>
                            <TableCell>Vendor</TableCell>
                            <TableCell align="right">Amount</TableCell>
                            <TableCell>Status</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {ensureArray(transactions).map((transaction: any) => (
                            <TableRow key={transaction.id}>
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        checked={selectedTransactions.includes(transaction.id)}
                                        onChange={() => handleSelectTransaction(transaction.id)}
                                    />
                                </TableCell>
                                <TableCell>{format(new Date(transaction.date), 'MMM dd, yyyy')}</TableCell>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        {transaction.is_transfer && (
                                            <Tooltip title="This is a transfer between accounts">
                                                <SwapHoriz color="info" fontSize="small" />
                                            </Tooltip>
                                        )}
                                        <Typography variant="body2">
                                            {transaction.description}
                                        </Typography>
                                    </Box>
                                </TableCell>
                                <TableCell>{getAccountChip(transaction)}</TableCell> {/* NEW */}
                                <TableCell>{transaction.category_name || '-'}</TableCell>
                                <TableCell>{transaction.vendor_name || '-'}</TableCell>
                                <TableCell align="right">
                                    <Box display="flex" alignItems="center" justifyContent="flex-end" gap={1}>
                                        <Typography
                                            variant="body2"
                                            color={transaction.amount >= 0 ? 'success.main' : 'text.primary'}>
                                            ${Math.abs(transaction.amount).toFixed(2)}
                                        </Typography>
                                        {transaction.amount < 0 && (
                                            <Chip label="Debit" size="small" color="default" />
                                        )}
                                        {transaction.amount > 0 && (
                                            <Chip label="Credit" size="small" color="default" />
                                        )}
                                    </Box>
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

            {/* Bulk Account Assignment Dialog */}
            <Dialog open={assignAccountDialog} onClose={() => setAssignAccountDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Assign Transactions to Account</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                        Assign {selectedTransactions.length} selected transactions to an account:
                    </Typography>
                    <FormControl fullWidth sx={{ mt: 2 }}>
                        <InputLabel>Select Account</InputLabel>
                        <Select
                            value={selectedAccountForAssignment}
                            onChange={(e) => setSelectedAccountForAssignment(e.target.value)}
                            label="Select Account">
                            {ensureArray(accounts).map((account: any) => (
                                <MenuItem key={account.id} value={account.id}>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <AccountIcon fontSize="small" />
                                        {account.name} ({account.institution || 'Unknown'})
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAssignAccountDialog(false)}>Cancel</Button>
                    <Button
                        onClick={handleBulkAssign}
                        variant="contained"
                        disabled={!selectedAccountForAssignment || bulkAssignMutation.isPending}>
                        Assign {selectedTransactions.length} Transactions
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Transaction Edit Dialog */}
            <TransactionEditDialog
                open={editDialog}
                onClose={handleCloseEditDialog}
                transaction={editingTransaction}
            />
        </Box>
    );
}