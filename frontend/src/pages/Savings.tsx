// frontend/src/pages/Savings.tsx - Dedicated savings management page

import { useState } from 'react';
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
    Button,
    Card,
    CardContent,
    Grid,
    LinearProgress,
    Chip,
    Alert,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    IconButton,
    Tooltip,
} from '@mui/material';
import {
    Savings as SavingsIcon,
    AccountBalance,
    TrendingUp,
    Add,
    ExpandMore,
    Edit,
    MonetizationOn,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';
import { SavingsAccountMappingDialog } from '../components/SavingsAccountMappingDialog';

interface Account {
    id: string;
    name: string;
    account_type: string;
    balance: number;
    currency: string;
    is_active: boolean;
    is_main_account: boolean;
    account_classification: string;
}

interface Category {
    id: string;
    name: string;
    category_type: string;
}

interface SavingsMapping {
    id: string;
    savings_category_id: string;
    account_id: string;
    target_amount?: number;
    current_amount: number;
    savings_category_name?: string;
    account_name?: string;
    is_active: boolean;
}

export default function Savings() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();
    const [savingsDialogOpen, setSavingsDialogOpen] = useState(false);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();
    const [selectedCategoryName, setSelectedCategoryName] = useState<string | undefined>();

    // Get all accounts
    const { data: accountsResponse } = useQuery({
        queryKey: ['accounts'],
        queryFn: () => apiClient.getAccounts(),
    });
    const accounts = accountsResponse?.data || [];

    // Get savings categories
    const { data: categoriesResponse } = useQuery({
        queryKey: ['categories'],
        queryFn: () => apiClient.getCategories(),
    });
    const savingsCategories = (categoriesResponse?.data || []).filter(
        (cat: Category) => cat.category_type === 'SAVING'
    );

    // Get savings mappings
    const { data: mappingsResponse, isLoading } = useQuery({
        queryKey: ['savings-mappings'],
        queryFn: () => apiClient.getSavingsMappings(),
    });
    const mappings = mappingsResponse?.data || [];

    // Format currency
    const formatCurrency = (amount: number, currency: string = 'CHF') => {
        return new Intl.NumberFormat('en-CH', {
            style: 'currency',
            currency: currency,
        }).format(amount);
    };

    // Calculate totals
    const totalTargetAmount = mappings.reduce((sum: number, mapping: SavingsMapping) =>
        sum + (mapping.target_amount || 0), 0
    );
    const totalCurrentAmount = mappings.reduce((sum: number, mapping: SavingsMapping) =>
        sum + mapping.current_amount, 0
    );
    const totalProgress = totalTargetAmount > 0 ? (totalCurrentAmount / totalTargetAmount) * 100 : 0;

    // Group mappings by category
    const mappingsByCategory = mappings.reduce((acc: Record<string, SavingsMapping[]>, mapping: SavingsMapping) => {
        const categoryId = mapping.savings_category_id;
        if (!acc[categoryId]) {
            acc[categoryId] = [];
        }
        acc[categoryId].push(mapping);
        return acc;
    }, {});

    const handleOpenSavingsDialog = (categoryId?: string, categoryName?: string) => {
        setSelectedCategoryId(categoryId);
        setSelectedCategoryName(categoryName);
        setSavingsDialogOpen(true);
    };

    const handleCloseSavingsDialog = () => {
        setSavingsDialogOpen(false);
        setSelectedCategoryId(undefined);
        setSelectedCategoryName(undefined);
    };

    if (isLoading) {
        return <Typography>Loading savings data...</Typography>;
    }

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <MonetizationOn color="primary" />
                    <Typography variant="h4">Savings Management</Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => handleOpenSavingsDialog()}
                >
                    Manage Mappings
                </Button>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
                <Typography variant="body2">
                    Track your savings goals by mapping savings categories to specific accounts.
                    Set target amounts and monitor your progress towards each savings goal.
                </Typography>
            </Alert>

            {/* Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Savings Categories
                            </Typography>
                            <Typography variant="h4">{savingsCategories.length}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Active Mappings
                            </Typography>
                            <Typography variant="h4">{mappings.length}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Total Target
                            </Typography>
                            <Typography variant="h4">{formatCurrency(totalTargetAmount)}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Total Saved
                            </Typography>
                            <Typography variant="h4" color="success.main">
                                {formatCurrency(totalCurrentAmount)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Overall Progress */}
            {totalTargetAmount > 0 && (
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" gutterBottom>
                        Overall Savings Progress
                    </Typography>
                    <Box display="flex" alignItems="center" gap={2} mb={2}>
                        <Box flexGrow={1}>
                            <LinearProgress
                                variant="determinate"
                                value={Math.min(totalProgress, 100)}
                                sx={{ height: 10, borderRadius: 5 }}
                                color={totalProgress >= 100 ? 'success' : 'primary'}
                            />
                        </Box>
                        <Typography variant="body2" sx={{ minWidth: 60 }}>
                            {totalProgress.toFixed(1)}%
                        </Typography>
                    </Box>
                    <Typography variant="body2" color="textSecondary">
                        {formatCurrency(totalCurrentAmount)} of {formatCurrency(totalTargetAmount)} saved
                        {totalTargetAmount > totalCurrentAmount &&
                            ` • ${formatCurrency(totalTargetAmount - totalCurrentAmount)} remaining`
                        }
                    </Typography>
                </Paper>
            )}

            {/* Savings Categories */}
            {savingsCategories.length === 0 ? (
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <SavingsIcon sx={{ fontSize: 48, color: 'action.disabled', mb: 2 }} />
                    <Typography variant="h6" color="textSecondary" gutterBottom>
                        No savings categories found
                    </Typography>
                    <Typography variant="body2" color="textSecondary" paragraph>
                        Create savings categories in the Categories page to start tracking your savings goals.
                    </Typography>
                    <Button variant="contained" href="/categories">
                        Go to Categories
                    </Button>
                </Paper>
            ) : (
                <Box>
                    {savingsCategories && Array.isArray(savingsCategories) ? savingsCategories.map((category: Category) => {
                        const categoryMappings = mappingsByCategory[category.id] || [];
                        const categoryTarget = categoryMappings.reduce((sum, m) => sum + (m.target_amount || 0), 0);
                        const categoryCurrent = categoryMappings.reduce((sum, m) => sum + m.current_amount, 0);
                        const categoryProgress = categoryTarget > 0 ? (categoryCurrent / categoryTarget) * 100 : 0;

                        return (
                            <Accordion key={category.id} sx={{ mb: 2 }}>
                                <AccordionSummary expandIcon={<ExpandMore />}>
                                    <Box display="flex" justifyContent="space-between" alignItems="center" width="100%" sx={{ pr: 1 }}>
                                        <Box display="flex" alignItems="center" gap={2}>
                                            <SavingsIcon color="primary" />
                                            <Typography variant="h6">{category.name}</Typography>
                                            <Chip
                                                label={`${categoryMappings.length} accounts`}
                                                size="small"
                                                variant="outlined"
                                            />
                                            {categoryTarget > 0 && (
                                                <Chip
                                                    label={`${categoryProgress.toFixed(0)}% complete`}
                                                    size="small"
                                                    color={categoryProgress >= 100 ? 'success' : 'primary'}
                                                />
                                            )}
                                        </Box>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            {categoryTarget > 0 && (
                                                <Typography variant="body2" color="textSecondary">
                                                    {formatCurrency(categoryCurrent)} / {formatCurrency(categoryTarget)}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                                        <Typography variant="body2" color="textSecondary">
                                            Account mappings for this savings category
                                        </Typography>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<Edit />}
                                            onClick={() => handleOpenSavingsDialog(category.id, category.name)}
                                        >
                                            Manage Mappings
                                        </Button>
                                    </Box>

                                    {categoryMappings.length === 0 ? (
                                        <Alert severity="info">
                                            No account mappings for this savings category yet.
                                        </Alert>
                                    ) : (
                                        <TableContainer>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Account</TableCell>
                                                        <TableCell align="right">Target Amount</TableCell>
                                                        <TableCell align="right">Current Amount</TableCell>
                                                        <TableCell align="right">Progress</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {categoryMappings && Array.isArray(categoryMappings) ? categoryMappings.map((mapping: SavingsMapping) => {
                                                        const progress = mapping.target_amount && mapping.target_amount > 0
                                                            ? (mapping.current_amount / mapping.target_amount) * 100
                                                            : 0;

                                                        return (
                                                            <TableRow key={mapping.id}>
                                                                <TableCell>
                                                                    <Box display="flex" alignItems="center" gap={1}>
                                                                        <AccountBalance fontSize="small" color="action" />
                                                                        {mapping.account_name}
                                                                    </Box>
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    {mapping.target_amount
                                                                        ? formatCurrency(mapping.target_amount)
                                                                        : '-'
                                                                    }
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    <Typography color="success.main">
                                                                        {formatCurrency(mapping.current_amount)}
                                                                    </Typography>
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    {mapping.target_amount && mapping.target_amount > 0 ? (
                                                                        <Box display="flex" alignItems="center" gap={1} sx={{ minWidth: 100 }}>
                                                                            <LinearProgress
                                                                                variant="determinate"
                                                                                value={Math.min(progress, 100)}
                                                                                sx={{ flexGrow: 1, height: 6 }}
                                                                                color={progress >= 100 ? 'success' : 'primary'}
                                                                            />
                                                                            <Typography variant="caption">
                                                                                {progress.toFixed(0)}%
                                                                            </Typography>
                                                                        </Box>
                                                                    ) : (
                                                                        <Typography variant="caption" color="textSecondary">
                                                                            No target set
                                                                        </Typography>
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    }) : null}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    )}
                                </AccordionDetails>
                            </Accordion>
                        );
                    }) : null}
                </Box>
            )}

            {/* Savings Account Mapping Dialog */}
            <SavingsAccountMappingDialog
                open={savingsDialogOpen}
                onClose={handleCloseSavingsDialog}
                categoryId={selectedCategoryId}
                categoryName={selectedCategoryName}
            />
        </Box>
    );
}
