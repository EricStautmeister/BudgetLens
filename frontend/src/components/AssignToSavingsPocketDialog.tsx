// frontend/src/components/AssignToSavingsPocketDialog.tsx - Dialog for assigning transactions to savings pockets

import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Box,
    Typography,
    Avatar,
    Chip,
    Alert,
    Grid,
    Card,
    CardContent,
    LinearProgress,
    Divider,
    TextField,
    InputAdornment,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    Savings,
    Close,
    AccountBalance,
    TrendingUp,
    Info,
    Assignment,
    Category as CategoryIcon,
    AttachMoney
} from '@mui/icons-material';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

interface Transaction {
    id: string;
    amount: number;
    description: string;
    date: string;
    account?: {
        id: string;
        name: string;
    };
    savings_pocket?: {
        id: string;
        name: string;
        color?: string;
    };
}

interface SavingsPocket {
    id: string;
    name: string;
    description?: string;
    target_amount?: number;
    current_amount: number;
    color?: string;
    icon?: string;
    account_id: string;
    account_name: string;
    progress_percentage: number;
    is_active: boolean;
}

interface AssignToSavingsPocketDialogProps {
    open: boolean;
    onClose: () => void;
    transactions: Transaction[];
    mode: 'single' | 'multiple';
}

export const AssignToSavingsPocketDialog: React.FC<AssignToSavingsPocketDialogProps> = ({
    open,
    onClose,
    transactions,
    mode
}) => {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();

    const [selectedPocketId, setSelectedPocketId] = useState<string>('');
    const [customAmount, setCustomAmount] = useState<string>('');
    const [useCustomAmount, setUseCustomAmount] = useState(false);

    const { data: pockets, isLoading: pocketsLoading } = useQuery({
        queryKey: ['savings-pockets'],
        queryFn: () => apiClient.getSavingsPockets().then(response => response.data),
        enabled: open
    });

    const assignTransactionMutation = useMutation({
        mutationFn: async ({ transactionId, pocketId, amount }: {
            transactionId: string;
            pocketId: string;
            amount?: number;
        }) => {
            if (mode === 'single') {
                return apiClient.assignTransferToPocket(transactionId, pocketId);
            } else {
                // For multiple transactions, we'll need to implement batch assignment
                return apiClient.assignTransferToPocket(transactionId, pocketId);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings-pockets'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            enqueueSnackbar('Transaction(s) assigned to savings pocket successfully', { variant: 'success' });
            onClose();
        },
        onError: (error: any) => {
            enqueueSnackbar(
                error.response?.data?.detail || 'Failed to assign transaction(s) to savings pocket',
                { variant: 'error' }
            );
        }
    });

    const handleAssign = async () => {
        if (!selectedPocketId) {
            enqueueSnackbar('Please select a savings pocket', { variant: 'warning' });
            return;
        }

        const amount = useCustomAmount ? Number(customAmount) : undefined;

        if (useCustomAmount && (!customAmount || Number(customAmount) <= 0)) {
            enqueueSnackbar('Please enter a valid amount', { variant: 'warning' });
            return;
        }

        if (mode === 'single') {
            await assignTransactionMutation.mutateAsync({
                transactionId: transactions[0].id,
                pocketId: selectedPocketId,
                amount
            });
        } else {
            // For multiple transactions, assign each one
            for (const transaction of transactions) {
                await assignTransactionMutation.mutateAsync({
                    transactionId: transaction.id,
                    pocketId: selectedPocketId,
                    amount
                });
            }
        }
    };

    const handleClose = () => {
        setSelectedPocketId('');
        setCustomAmount('');
        setUseCustomAmount(false);
        onClose();
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: 'CHF'
        }).format(amount);
    };

    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
    const activePockets = pockets?.filter((p: SavingsPocket) => p.is_active) || [];
    const selectedPocket = activePockets.find((p: SavingsPocket) => p.id === selectedPocketId);

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box display="flex" alignItems="center" gap={1}>
                        <Assignment color="primary" />
                        <Typography variant="h6">
                            Assign to Savings Pocket
                        </Typography>
                    </Box>
                    <IconButton onClick={handleClose}>
                        <Close />
                    </IconButton>
                </Box>
            </DialogTitle>

            <DialogContent>
                {/* Transaction Summary */}
                <Alert severity="info" sx={{ mb: 3 }}>
                    <Typography variant="body2">
                        {mode === 'single'
                            ? `Assigning transaction: ${transactions[0]?.description}`
                            : `Assigning ${transactions.length} transactions`
                        }
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                        Total Amount: {formatCurrency(totalAmount)}
                    </Typography>
                </Alert>

                <Grid container spacing={3}>
                    {/* Savings Pocket Selection */}
                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                            <InputLabel>Select Savings Pocket</InputLabel>
                            <Select
                                value={selectedPocketId}
                                onChange={(e) => setSelectedPocketId(e.target.value)}
                                label="Select Savings Pocket"
                            >
                                {pocketsLoading ? (
                                    <MenuItem disabled>Loading pockets...</MenuItem>
                                ) : activePockets.length === 0 ? (
                                    <MenuItem disabled>No active savings pockets</MenuItem>
                                ) : (
                                    activePockets.map((pocket: SavingsPocket) => (
                                        <MenuItem key={pocket.id} value={pocket.id}>
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <Avatar
                                                    sx={{
                                                        bgcolor: pocket.color || '#4CAF50',
                                                        width: 24,
                                                        height: 24
                                                    }}
                                                >
                                                    <Savings sx={{ fontSize: 14 }} />
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="body2">{pocket.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {pocket.account_name}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </MenuItem>
                                    ))
                                )}
                            </Select>
                        </FormControl>
                    </Grid>

                    {/* Custom Amount */}
                    <Grid item xs={12} md={6}>
                        <Box>
                            <FormControl fullWidth>
                                <TextField
                                    label="Custom Amount (Optional)"
                                    type="number"
                                    value={customAmount}
                                    onChange={(e) => setCustomAmount(e.target.value)}
                                    disabled={!useCustomAmount}
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start">CHF</InputAdornment>,
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <Tooltip title="Use custom amount instead of transaction amount">
                                                    <IconButton
                                                        onClick={() => setUseCustomAmount(!useCustomAmount)}
                                                        color={useCustomAmount ? 'primary' : 'default'}
                                                    >
                                                        <AttachMoney />
                                                    </IconButton>
                                                </Tooltip>
                                            </InputAdornment>
                                        )
                                    }}
                                    helperText={useCustomAmount
                                        ? "Enter the amount to assign to the savings pocket"
                                        : "Click the icon to use custom amount"
                                    }
                                />
                            </FormControl>
                        </Box>
                    </Grid>
                </Grid>

                {/* Selected Pocket Details */}
                {selectedPocket && (
                    <Card sx={{ mt: 3 }}>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={2} mb={2}>
                                <Avatar sx={{ bgcolor: selectedPocket.color || '#4CAF50' }}>
                                    <Savings />
                                </Avatar>
                                <Box>
                                    <Typography variant="h6">{selectedPocket.name}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {selectedPocket.account_name}
                                    </Typography>
                                </Box>
                            </Box>

                            {selectedPocket.description && (
                                <Typography variant="body2" color="text.secondary" mb={2}>
                                    {selectedPocket.description}
                                </Typography>
                            )}

                            <Grid container spacing={2}>
                                <Grid item xs={12} md={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Current Balance
                                    </Typography>
                                    <Typography variant="h6" color="primary">
                                        {formatCurrency(selectedPocket.current_amount)}
                                    </Typography>
                                </Grid>
                                {selectedPocket.target_amount && (
                                    <Grid item xs={12} md={6}>
                                        <Typography variant="body2" color="text.secondary">
                                            Target Amount
                                        </Typography>
                                        <Typography variant="h6">
                                            {formatCurrency(selectedPocket.target_amount)}
                                        </Typography>
                                    </Grid>
                                )}
                            </Grid>

                            {selectedPocket.target_amount && (
                                <Box mt={2}>
                                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                        <Typography variant="body2" color="text.secondary">
                                            Progress
                                        </Typography>
                                        <Typography variant="body2">
                                            {selectedPocket.progress_percentage.toFixed(1)}%
                                        </Typography>
                                    </Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={Math.min(selectedPocket.progress_percentage, 100)}
                                        sx={{ height: 8, borderRadius: 4 }}
                                    />
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Transaction List (for multiple mode) */}
                {mode === 'multiple' && transactions.length > 0 && (
                    <Box mt={3}>
                        <Typography variant="h6" gutterBottom>
                            Transactions to Assign
                        </Typography>
                        <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                            {transactions.map((transaction) => (
                                <Card key={transaction.id} sx={{ mb: 1 }}>
                                    <CardContent sx={{ py: 1 }}>
                                        <Box display="flex" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {transaction.description}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {new Date(transaction.date).toLocaleDateString()}
                                                </Typography>
                                            </Box>
                                            <Typography variant="body2" fontWeight="medium">
                                                {formatCurrency(transaction.amount)}
                                            </Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            ))}
                        </Box>
                    </Box>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={handleClose}>
                    Cancel
                </Button>
                <Button
                    onClick={handleAssign}
                    variant="contained"
                    disabled={!selectedPocketId || assignTransactionMutation.isPending}
                    startIcon={<Assignment />}
                >
                    {assignTransactionMutation.isPending ? 'Assigning...' : 'Assign to Pocket'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
