// frontend/src/components/EnhancedTransactionDetails.tsx - Component showing enhanced transaction information

import React from 'react';
import {
    Box,
    Typography,
    Chip,
    Tooltip,
    Grid,
    Card,
    CardContent,
    Avatar,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    IconButton,
    Menu,
    MenuItem,
    ListItemAvatar
} from '@mui/material';
import {
    AccountBalance,
    CreditCard,
    LocationOn,
    Receipt,
    Info,
    Assignment,
    MoreVert,
    Edit,
    Savings,
    Category as CategoryIcon
} from '@mui/icons-material';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';

interface EnhancedTransaction {
    id: string;
    amount: number;
    description: string;
    date: string;
    category?: {
        id: string;
        name: string;
        type: string;
    };
    account?: {
        id: string;
        name: string;
        account_type: string;
    };
    vendor?: {
        id: string;
        name: string;
    };
    // Enhanced fields
    details?: string;
    reference_number?: string;
    payment_method?: string;
    location?: string;
    savings_pocket?: {
        id: string;
        name: string;
        color?: string;
    };
    // Transaction type indicators
    is_transfer?: boolean;
    is_recurring?: boolean;
    confidence_score?: number;
}

interface UserSettings {
    show_transaction_details: boolean;
    show_reference_number: boolean;
    show_payment_method: boolean;
    show_location: boolean;
    default_currency: string;
    date_format: string;
    number_format: string;
}

interface EnhancedTransactionDetailsProps {
    transaction: EnhancedTransaction;
    showActions?: boolean;
    onEdit?: (transaction: EnhancedTransaction) => void;
    onAssignToSavingsPocket?: (transaction: EnhancedTransaction) => void;
    compact?: boolean;
}

export const EnhancedTransactionDetails: React.FC<EnhancedTransactionDetailsProps> = ({
    transaction,
    showActions = true,
    onEdit,
    onAssignToSavingsPocket,
    compact = false
}) => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const { data: userSettings } = useQuery({
        queryKey: ['user-settings'],
        queryFn: () => apiClient.getUserSettings().then(response => response.data),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    const formatCurrency = (amount: number) => {
        const currency = userSettings?.default_currency || 'CHF';
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: currency
        }).format(amount);
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const format = userSettings?.date_format || 'DD/MM/YYYY';

        if (format === 'DD/MM/YYYY') {
            return date.toLocaleDateString('en-GB');
        } else if (format === 'MM/DD/YYYY') {
            return date.toLocaleDateString('en-US');
        } else {
            return date.toLocaleDateString('sv-SE'); // YYYY-MM-DD format
        }
    };

    const getPaymentMethodIcon = (method?: string) => {
        if (!method) return <CreditCard />;

        switch (method.toLowerCase()) {
            case 'cash':
                return <Receipt />;
            case 'card':
            case 'credit_card':
            case 'debit_card':
                return <CreditCard />;
            case 'transfer':
            case 'bank_transfer':
                return <AccountBalance />;
            default:
                return <CreditCard />;
        }
    };

    const getTransactionTypeColor = () => {
        if (transaction.is_transfer) return 'info';
        if (transaction.amount > 0) return 'success';
        return 'default';
    };

    const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    const handleEdit = () => {
        if (onEdit) onEdit(transaction);
        handleMenuClose();
    };

    const handleAssignToSavingsPocket = () => {
        if (onAssignToSavingsPocket) onAssignToSavingsPocket(transaction);
        handleMenuClose();
    };

    if (compact) {
        return (
            <Card sx={{ mb: 1 }}>
                <CardContent sx={{ py: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={6}>
                            <Box display="flex" alignItems="center" gap={1}>
                                <Avatar sx={{ width: 32, height: 32 }}>
                                    {getPaymentMethodIcon(transaction.payment_method)}
                                </Avatar>
                                <Box>
                                    <Typography variant="body2" fontWeight="medium">
                                        {transaction.description}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {formatDate(transaction.date)}
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={3}>
                            <Box display="flex" gap={1} flexWrap="wrap">
                                {transaction.category && (
                                    <Chip
                                        label={transaction.category.name}
                                        size="small"
                                        color="primary"
                                        variant="outlined"
                                    />
                                )}
                                {transaction.savings_pocket && (
                                    <Chip
                                        label={transaction.savings_pocket.name}
                                        size="small"
                                        color="secondary"
                                        variant="outlined"
                                        icon={<Savings />}
                                    />
                                )}
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={2}>
                            <Typography
                                variant="body2"
                                fontWeight="medium"
                                color={transaction.amount > 0 ? 'success.main' : 'text.primary'}
                            >
                                {formatCurrency(transaction.amount)}
                            </Typography>
                        </Grid>
                        <Grid item xs={12} md={1}>
                            {showActions && (
                                <IconButton size="small" onClick={handleMenuClick}>
                                    <MoreVert />
                                </IconButton>
                            )}
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card sx={{ mb: 2 }}>
            <CardContent>
                <Grid container spacing={3}>
                    {/* Main Transaction Info */}
                    <Grid item xs={12} md={8}>
                        <Box display="flex" alignItems="center" gap={2} mb={2}>
                            <Avatar sx={{ bgcolor: getTransactionTypeColor() + '.main' }}>
                                {getPaymentMethodIcon(transaction.payment_method)}
                            </Avatar>
                            <Box flexGrow={1}>
                                <Typography variant="h6" gutterBottom>
                                    {transaction.description}
                                </Typography>
                                <Box display="flex" alignItems="center" gap={2}>
                                    <Typography variant="body2" color="text.secondary">
                                        {formatDate(transaction.date)}
                                    </Typography>
                                    {transaction.account && (
                                        <Chip
                                            label={transaction.account.name}
                                            size="small"
                                            variant="outlined"
                                            icon={<AccountBalance />}
                                        />
                                    )}
                                    {transaction.is_transfer && (
                                        <Chip
                                            label="Transfer"
                                            size="small"
                                            color="info"
                                            variant="outlined"
                                        />
                                    )}
                                    {transaction.is_recurring && (
                                        <Chip
                                            label="Recurring"
                                            size="small"
                                            color="warning"
                                            variant="outlined"
                                        />
                                    )}
                                </Box>
                            </Box>
                        </Box>

                        {/* Enhanced Details */}
                        <List dense>
                            {userSettings?.show_transaction_details && transaction.details && (
                                <ListItem>
                                    <ListItemIcon>
                                        <Info />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary="Details"
                                        secondary={transaction.details}
                                    />
                                </ListItem>
                            )}

                            {userSettings?.show_reference_number && transaction.reference_number && (
                                <ListItem>
                                    <ListItemIcon>
                                        <Receipt />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary="Reference"
                                        secondary={transaction.reference_number}
                                    />
                                </ListItem>
                            )}

                            {userSettings?.show_payment_method && transaction.payment_method && (
                                <ListItem>
                                    <ListItemIcon>
                                        <CreditCard />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary="Payment Method"
                                        secondary={transaction.payment_method}
                                    />
                                </ListItem>
                            )}

                            {userSettings?.show_location && transaction.location && (
                                <ListItem>
                                    <ListItemIcon>
                                        <LocationOn />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary="Location"
                                        secondary={transaction.location}
                                    />
                                </ListItem>
                            )}
                        </List>
                    </Grid>

                    {/* Amount and Actions */}
                    <Grid item xs={12} md={4}>
                        <Box textAlign="right">
                            <Typography
                                variant="h5"
                                fontWeight="bold"
                                color={transaction.amount > 0 ? 'success.main' : 'text.primary'}
                                gutterBottom
                            >
                                {formatCurrency(transaction.amount)}
                            </Typography>

                            {/* Category and Savings Pocket */}
                            <Box display="flex" flexDirection="column" gap={1} mb={2}>
                                {transaction.category && (
                                    <Chip
                                        label={transaction.category.name}
                                        color="primary"
                                        icon={<CategoryIcon />}
                                    />
                                )}
                                {transaction.savings_pocket && (
                                    <Chip
                                        label={transaction.savings_pocket.name}
                                        color="secondary"
                                        icon={<Savings />}
                                        sx={{ bgcolor: transaction.savings_pocket.color }}
                                    />
                                )}
                            </Box>

                            {/* Confidence Score */}
                            {transaction.confidence_score && (
                                <Tooltip title="Categorization Confidence">
                                    <Chip
                                        label={`${(transaction.confidence_score * 100).toFixed(0)}%`}
                                        size="small"
                                        color={transaction.confidence_score > 0.8 ? 'success' : 'warning'}
                                        variant="outlined"
                                    />
                                </Tooltip>
                            )}

                            {/* Actions */}
                            {showActions && (
                                <Box mt={2}>
                                    <IconButton onClick={handleMenuClick}>
                                        <MoreVert />
                                    </IconButton>
                                </Box>
                            )}
                        </Box>
                    </Grid>
                </Grid>
            </CardContent>

            {/* Actions Menu */}
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
            >
                <MenuItem onClick={handleEdit}>
                    <ListItemIcon>
                        <Edit fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Edit Transaction</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleAssignToSavingsPocket}>
                    <ListItemIcon>
                        <Savings fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Assign to Savings Pocket</ListItemText>
                </MenuItem>
            </Menu>
        </Card>
    );
};
