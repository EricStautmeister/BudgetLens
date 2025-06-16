// frontend/src/pages/Settings.tsx - General settings page with tabs for different settings categories including transfer settings

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box,
    Typography,
    TextField,
    Button,
    IconButton,
    Card,
    CardContent,
    Grid,
    Slider,
    FormControlLabel,
    Switch,
    Chip,
    Alert,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Collapse,
    Tabs,
    Tab,
    Paper,
    Divider,
} from '@mui/material';
import {
    Settings as SettingsIcon,
    Add,
    Delete,
    ExpandMore,
    ArrowCircleUp,
    Tune,
    Pattern,
    Preview,
    Security,
    Notifications,
    AccountCircle,
    Save,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

// Transfer settings interfaces
interface TransferRule {
    id?: string;
    name: string;
    pattern: string;
    enabled: boolean;
    autoConfirm: boolean;
    allowFees: boolean;
    maxFeeTolerance: number;
    description: string;
}

interface TransferSettings {
    daysLookback: number;
    amountTolerance: number;
    percentageTolerance: number;
    confidenceThreshold: number;
    enableAutoMatching: boolean;
    rules: TransferRule[];
}

// General settings interfaces
interface UserPreferences {
    darkMode: boolean;
    language: string;
    currencyFormat: string;
    dashboardLayout: string;
}

interface NotificationSettings {
    emailNotifications: boolean;
    budgetAlerts: boolean;
    lowBalanceAlerts: boolean;
    transferAlerts: boolean;
    securityAlerts: boolean;
}

interface GeneralSettings {
    user: UserPreferences;
    notifications: NotificationSettings;
    transfers: TransferSettings;
}

const DEFAULT_RULES: TransferRule[] = [
    {
        name: "Personal Name",
        pattern: "",
        enabled: true,
        autoConfirm: true,
        allowFees: false,
        maxFeeTolerance: 0,
        description: "Transfers containing your name"
    },
    {
        name: "Revolut",
        pattern: "REVOLUT",
        enabled: true,
        autoConfirm: true,
        allowFees: true,
        maxFeeTolerance: 5.00,
        description: "Revolut transfers (may include fees)"
    },
    {
        name: "Savings Keywords",
        pattern: "SPAREN|SAVING|SPARKONTO",
        enabled: true,
        autoConfirm: true,
        allowFees: false,
        maxFeeTolerance: 0,
        description: "Transfers to/from savings accounts"
    },
    {
        name: "Credit Card Payment",
        pattern: "KREDITKARTE|VISA|MASTERCARD",
        enabled: true,
        autoConfirm: false,
        allowFees: false,
        maxFeeTolerance: 0,
        description: "Credit card payments and transactions"
    }
];

const DEFAULT_SETTINGS: GeneralSettings = {
    user: {
        darkMode: false,
        language: 'en',
        currencyFormat: 'CHF ###,###.##',
        dashboardLayout: 'default'
    },
    notifications: {
        emailNotifications: true,
        budgetAlerts: true,
        lowBalanceAlerts: true,
        transferAlerts: true,
        securityAlerts: true
    },
    transfers: {
        daysLookback: 7,
        amountTolerance: 0.50,
        percentageTolerance: 0.02,
        confidenceThreshold: 0.85,
        enableAutoMatching: true,
        rules: DEFAULT_RULES
    }
};

// Tab panel component
interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`settings-tabpanel-${index}`}
            aria-labelledby={`settings-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

export default function Settings() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();
    const navigate = useNavigate();
    const location = useLocation();
    const { isDarkMode, setDarkMode } = useTheme();
    const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_SETTINGS);
    const [tabValue, setTabValue] = useState(0);

    // Transfer settings state
    const [editingRule, setEditingRule] = useState<TransferRule | null>(null);
    const [newRule, setNewRule] = useState<TransferRule>({
        name: '',
        pattern: '',
        enabled: true,
        autoConfirm: false,
        allowFees: false,
        maxFeeTolerance: 0,
        description: ''
    });
    const [addRuleOpen, setAddRuleOpen] = useState(false);
    const [testResults, setTestResults] = useState<any>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Check if we should open a specific tab from the URL
    useEffect(() => {
        if (location.hash === '#transfers') {
            setTabValue(2); // Transfer settings tab
        } else if (location.hash === '#notifications') {
            setTabValue(1); // Notifications tab
        } else if (location.hash === '#user') {
            setTabValue(0); // User preferences tab
        }
    }, [location]);

    // Handle tab changes
    const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
        // Update URL hash based on tab
        switch (newValue) {
            case 0:
                navigate('/settings#user', { replace: true });
                break;
            case 1:
                navigate('/settings#notifications', { replace: true });
                break;
            case 2:
                navigate('/settings#transfers', { replace: true });
                break;
            default:
                navigate('/settings', { replace: true });
        }
    };

    // Load existing settings
    const { data, isError, error } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            // First try to get general settings
            try {
                const response = await apiClient.getSettings();
                return response.data;
            } catch (error) {
                // If general settings endpoint doesn't exist yet, fall back to transfer settings
                const transferResponse = await apiClient.getTransferSettings();

                if (transferResponse.data && typeof transferResponse.data === 'object') {
                    // Handle different response formats
                    const transferSettings = transferResponse.data.transfers || transferResponse.data;

                    // Create a complete settings object with transfer settings
                    return {
                        ...DEFAULT_SETTINGS,
                        transfers: transferSettings
                    };
                } else {
                    return DEFAULT_SETTINGS;
                }
            }
        }
    });

    // Helper function to process settings data from API responses
    const processSettingsData = (data: any): GeneralSettings => {
        // If data already has the correct shape, use it
        if (data && data.user && data.notifications && data.transfers) {
            return data as GeneralSettings;
        }

        // If data is just transfer settings
        if (data && !data.user && !data.notifications) {
            return {
                ...DEFAULT_SETTINGS,
                transfers: data
            };
        }

        // Default case
        return DEFAULT_SETTINGS;
    };

    // Handle data loading with useEffect
    useEffect(() => {
        if (data) {
            const processedSettings = processSettingsData(data);

            // Sync the local settings with the theme context's current state
            const settingsWithCurrentTheme = {
                ...processedSettings,
                user: {
                    ...processedSettings.user,
                    darkMode: isDarkMode
                }
            };

            setSettings(settingsWithCurrentTheme);

            // Note: Don't call setDarkMode here to avoid conflicts with ThemeContext
            // The ThemeContext is the single source of truth for theme state
        }
    }, [data, isDarkMode]);

    // Handle errors with useEffect
    useEffect(() => {
        if (isError && error) {
            const errorMessage = (error as any)?.response?.data?.detail || 'Failed to load settings';
            enqueueSnackbar(errorMessage, { variant: 'error' });
        }
    }, [isError, error, enqueueSnackbar]);

    // Save settings mutation
    const saveSettingsMutation = useMutation({
        mutationFn: async (newSettings: GeneralSettings) => {
            try {
                // Ensure dark mode state is synchronized with theme context before saving
                const settingsToSave = {
                    ...newSettings,
                    user: {
                        ...newSettings.user,
                        darkMode: isDarkMode // Always use the theme context's current state
                    }
                };

                // Try to save with new general settings endpoint
                const response = await apiClient.saveSettings(settingsToSave);
                return response;
            } catch (error: any) {
                // If general settings endpoint isn't available, fall back to just updating transfer settings
                if (error.response?.status === 404) {
                    console.info('General settings endpoint not available, falling back to transfer settings');
                    const transferResponse = await apiClient.saveTransferSettings(newSettings.transfers);
                    return {
                        ...transferResponse,
                        data: {
                            ...newSettings,
                            transfers: transferResponse.data
                        }
                    };
                }
                throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
            queryClient.invalidateQueries({ queryKey: ['transferSettings'] });
            enqueueSnackbar('Settings saved successfully', { variant: 'success' });
        },
        onError: (error: any) => {
            enqueueSnackbar(error.response?.data?.detail || 'Failed to save settings', { variant: 'error' });
        },
    });

    // Test transfer rules mutation
    const testRulesMutation = useMutation({
        mutationFn: async (testSettings: TransferSettings) => {
            return apiClient.testTransferRules(testSettings);
        },
        onSuccess: (data) => {
            setTestResults(data.data);
            enqueueSnackbar(`Test completed: ${data.data.matches} potential matches found`, { variant: 'info' });
        },
        onError: (error: any) => {
            enqueueSnackbar(error.response?.data?.detail || 'Test failed', { variant: 'error' });
        },
    });

    // Handle save settings
    const handleSaveSettings = () => {
        saveSettingsMutation.mutate(settings);
    };

    // Transfer settings handlers
    const handleTestRules = () => {
        testRulesMutation.mutate(settings.transfers);
    };

    const handleAddRule = () => {
        if (!newRule.name || !newRule.pattern) {
            enqueueSnackbar('Name and pattern are required', { variant: 'error' });
            return;
        }

        setSettings(prev => ({
            ...prev,
            transfers: {
                ...prev.transfers,
                rules: [...prev.transfers.rules, { ...newRule, id: Date.now().toString() }]
            }
        }));

        setNewRule({
            name: '',
            pattern: '',
            enabled: true,
            autoConfirm: false,
            allowFees: false,
            maxFeeTolerance: 0,
            description: ''
        });
        setAddRuleOpen(false);
    };

    const handleDeleteRule = (index: number) => {
        setSettings(prev => ({
            ...prev,
            transfers: {
                ...prev.transfers,
                rules: prev.transfers.rules.filter((_, i) => i !== index)
            }
        }));
    };

    const handleUpdateRule = (index: number, updatedRule: Partial<TransferRule>) => {
        setSettings(prev => ({
            ...prev,
            transfers: {
                ...prev.transfers,
                rules: prev.transfers.rules.map((rule, i) =>
                    i === index ? { ...rule, ...updatedRule } : rule
                )
            }
        }));
    };

    const resetToDefaults = () => {
        setSettings(DEFAULT_SETTINGS);
        enqueueSnackbar('Settings reset to defaults', { variant: 'info' });
    };

    const resetTransferSettings = () => {
        setSettings(prev => ({
            ...prev,
            transfers: DEFAULT_SETTINGS.transfers
        }));
        enqueueSnackbar('Transfer settings reset to defaults', { variant: 'info' });
    };

    const resetUserPreferences = () => {
        setSettings(prev => ({
            ...prev,
            user: DEFAULT_SETTINGS.user
        }));
        enqueueSnackbar('User preferences reset to defaults', { variant: 'info' });
    };

    const resetNotificationSettings = () => {
        setSettings(prev => ({
            ...prev,
            notifications: DEFAULT_SETTINGS.notifications
        }));
        enqueueSnackbar('Notification settings reset to defaults', { variant: 'info' });
    };

    // Update user preferences
    const updateUserPreferences = (field: keyof UserPreferences, value: any) => {
        setSettings(prev => ({
            ...prev,
            user: {
                ...prev.user,
                [field]: value
            }
        }));

        // Special handling for dark mode to sync with theme context
        if (field === 'darkMode') {
            setDarkMode(value); // Theme context will handle saving to API
        }
    };

    // Update notification settings
    const updateNotificationSettings = (field: keyof NotificationSettings, value: boolean) => {
        setSettings(prev => ({
            ...prev,
            notifications: {
                ...prev.notifications,
                [field]: value
            }
        }));
    };

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <SettingsIcon fontSize="large" color="primary" />
                    <Typography variant="h4">Settings</Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<Save />}
                    onClick={handleSaveSettings}
                    disabled={saveSettingsMutation.isPending}>
                    Save All Settings
                </Button>
            </Box>

            <Paper sx={{ mb: 4 }}>
                <Tabs
                    value={tabValue}
                    onChange={handleTabChange}
                    variant="fullWidth"
                    indicatorColor="primary"
                    textColor="primary"
                    aria-label="settings tabs"
                >
                    <Tab icon={<AccountCircle />} label="User Preferences" id="settings-tab-0" />
                    <Tab icon={<Notifications />} label="Notifications" id="settings-tab-1" />
                    <Tab icon={<Tune />} label="Transfer Settings" id="settings-tab-2" />
                </Tabs>
            </Paper>

            {/* User Preferences Tab */}
            <TabPanel value={tabValue} index={0}>
                <Card>
                    <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                            <Box display="flex" alignItems="center" gap={1}>
                                <AccountCircle />
                                <Typography variant="h6">User Preferences</Typography>
                            </Box>
                            <Button
                                size="small"
                                onClick={resetUserPreferences}
                                color="secondary">
                                Reset to Defaults
                            </Button>
                        </Box>

                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={isDarkMode}
                                            onChange={(e) => updateUserPreferences('darkMode', e.target.checked)}
                                        />
                                    }
                                    label="Dark Mode"
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    select
                                    fullWidth
                                    label="Language"
                                    value={settings.user.language}
                                    onChange={(e) => updateUserPreferences('language', e.target.value)}
                                    SelectProps={{
                                        native: true,
                                    }}
                                >
                                    <option value="en">English</option>
                                    <option value="de">German</option>
                                    <option value="fr">French</option>
                                    <option value="it">Italian</option>
                                </TextField>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    select
                                    fullWidth
                                    label="Currency Format"
                                    value={settings.user.currencyFormat}
                                    onChange={(e) => updateUserPreferences('currencyFormat', e.target.value)}
                                    SelectProps={{
                                        native: true,
                                    }}
                                >
                                    <option value="CHF ###,###.##">CHF ###,###.##</option>
                                    <option value="###,###.## CHF">###,###.## CHF</option>
                                    <option value="CHF ### ###.##">CHF ### ###.##</option>
                                </TextField>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    select
                                    fullWidth
                                    label="Dashboard Layout"
                                    value={settings.user.dashboardLayout}
                                    onChange={(e) => updateUserPreferences('dashboardLayout', e.target.value)}
                                    SelectProps={{
                                        native: true,
                                    }}
                                >
                                    <option value="default">Default</option>
                                    <option value="compact">Compact</option>
                                    <option value="expanded">Expanded</option>
                                </TextField>
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>
            </TabPanel>

            {/* Notifications Tab */}
            <TabPanel value={tabValue} index={1}>
                <Card>
                    <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                            <Box display="flex" alignItems="center" gap={1}>
                                <Notifications />
                                <Typography variant="h6">Notification Settings</Typography>
                            </Box>
                            <Button
                                size="small"
                                onClick={resetNotificationSettings}
                                color="secondary">
                                Reset to Defaults
                            </Button>
                        </Box>

                        <Grid container spacing={3}>
                            <Grid item xs={12}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={settings.notifications.emailNotifications}
                                            onChange={(e) => updateNotificationSettings('emailNotifications', e.target.checked)}
                                        />
                                    }
                                    label="Enable Email Notifications"
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <Divider />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={settings.notifications.budgetAlerts}
                                            onChange={(e) => updateNotificationSettings('budgetAlerts', e.target.checked)}
                                        />
                                    }
                                    label="Budget Alerts"
                                />
                                <Typography variant="caption" display="block" color="textSecondary">
                                    Receive alerts when you approach or exceed your budget limits
                                </Typography>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={settings.notifications.lowBalanceAlerts}
                                            onChange={(e) => updateNotificationSettings('lowBalanceAlerts', e.target.checked)}
                                        />
                                    }
                                    label="Low Balance Alerts"
                                />
                                <Typography variant="caption" display="block" color="textSecondary">
                                    Be notified when account balances fall below specified thresholds
                                </Typography>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={settings.notifications.transferAlerts}
                                            onChange={(e) => updateNotificationSettings('transferAlerts', e.target.checked)}
                                        />
                                    }
                                    label="Transfer Alerts"
                                />
                                <Typography variant="caption" display="block" color="textSecondary">
                                    Get notified about detected transfers between your accounts
                                </Typography>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={settings.notifications.securityAlerts}
                                            onChange={(e) => updateNotificationSettings('securityAlerts', e.target.checked)}
                                        />
                                    }
                                    label="Security Alerts"
                                />
                                <Typography variant="caption" display="block" color="textSecondary">
                                    Critical security notifications about your account
                                </Typography>
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>
            </TabPanel>

            {/* Transfer Settings Tab */}
            <TabPanel value={tabValue} index={2}>
                <Alert severity="info" sx={{ mb: 3 }}>
                    <Typography variant="body2">
                        Configure how the system detects transfers between your accounts.
                        Use pattern rules to automatically identify specific transfer types.
                    </Typography>
                </Alert>

                {/* Basic Settings */}
                <Card sx={{ mb: 3 }}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom>
                            Basic Detection Settings
                        </Typography>

                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <Box>
                                    <Typography variant="subtitle2" gutterBottom>
                                        Days Lookback: {settings.transfers.daysLookback}
                                    </Typography>
                                    <Slider
                                        value={settings.transfers.daysLookback}
                                        onChange={(_, value) => setSettings(prev => ({
                                            ...prev,
                                            transfers: {
                                                ...prev.transfers,
                                                daysLookback: value as number
                                            }
                                        }))}
                                        min={1}
                                        max={30}
                                        marks={[
                                            { value: 1, label: '1' },
                                            { value: 7, label: '7' },
                                            { value: 14, label: '14' },
                                            { value: 30, label: '30' }
                                        ]}
                                    />
                                    <Typography variant="caption" color="textSecondary">
                                        How many days back to search for potential transfers
                                    </Typography>
                                </Box>
                            </Grid>

                            <Grid item xs={12} md={6}>
                                <Box>
                                    <Typography variant="subtitle2" gutterBottom>
                                        Confidence Threshold: {(settings.transfers.confidenceThreshold * 100).toFixed(0)}%
                                    </Typography>
                                    <Slider
                                        value={settings.transfers.confidenceThreshold}
                                        onChange={(_, value) => setSettings(prev => ({
                                            ...prev,
                                            transfers: {
                                                ...prev.transfers,
                                                confidenceThreshold: value as number
                                            }
                                        }))}
                                        min={0.5}
                                        max={1.0}
                                        step={0.05}
                                        marks={[
                                            { value: 0.5, label: '50%' },
                                            { value: 0.75, label: '75%' },
                                            { value: 0.85, label: '85%' },
                                            { value: 0.95, label: '95%' }
                                        ]}
                                    />
                                    <Typography variant="caption" color="textSecondary">
                                        Minimum confidence required for auto-confirmation
                                    </Typography>
                                </Box>
                            </Grid>

                            <Grid item xs={12}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={settings.transfers.enableAutoMatching}
                                            onChange={(e) => setSettings(prev => ({
                                                ...prev,
                                                transfers: {
                                                    ...prev.transfers,
                                                    enableAutoMatching: e.target.checked
                                                }
                                            }))}
                                        />
                                    }
                                    label="Enable automatic transfer matching"
                                />
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>

                {/* Advanced Settings */}
                <Card sx={{ mb: 3 }}>
                    <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                            <Typography variant="h6">Advanced Settings</Typography>
                            <Button
                                startIcon={showAdvanced ? <ExpandMore /> : <Tune />}
                                onClick={() => setShowAdvanced(!showAdvanced)}>
                                {showAdvanced ? 'Hide' : 'Show'} Advanced
                            </Button>
                        </Box>

                        <Collapse in={showAdvanced}>
                            <Grid container spacing={3}>
                                <Grid item xs={12} md={6}>
                                    <TextField
                                        fullWidth
                                        label="Amount Tolerance (CHF)"
                                        type="number"
                                        value={settings.transfers.amountTolerance}
                                        onChange={(e) => setSettings(prev => ({
                                            ...prev,
                                            transfers: {
                                                ...prev.transfers,
                                                amountTolerance: parseFloat(e.target.value) || 0
                                            }
                                        }))}
                                        inputProps={{ step: 0.1, min: 0 }}
                                        helperText="Fixed amount difference allowed (for fees)"
                                    />
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <TextField
                                        fullWidth
                                        label="Percentage Tolerance"
                                        type="number"
                                        value={settings.transfers.percentageTolerance * 100}
                                        onChange={(e) => setSettings(prev => ({
                                            ...prev,
                                            transfers: {
                                                ...prev.transfers,
                                                percentageTolerance: (parseFloat(e.target.value) || 0) / 100
                                            }
                                        }))}
                                        inputProps={{ step: 0.1, min: 0, max: 20 }}
                                        helperText="Percentage difference allowed (2% = 0.02)"
                                    />
                                </Grid>
                            </Grid>
                        </Collapse>
                    </CardContent>
                </Card>

                {/* Transfer Rules */}
                <Card>
                    <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                            <Box display="flex" alignItems="center" gap={1}>
                                <Pattern />
                                <Typography variant="h6">Transfer Rules</Typography>
                            </Box>
                            <Box display="flex" gap={1}>
                                <Button
                                    size="small"
                                    onClick={resetTransferSettings}
                                    color="secondary">
                                    Reset Defaults
                                </Button>
                                <Button
                                    variant="outlined"
                                    startIcon={<Add />}
                                    onClick={() => setAddRuleOpen(true)}>
                                    Add Rule
                                </Button>
                                <Button
                                    variant="outlined"
                                    startIcon={<ArrowCircleUp />}
                                    onClick={handleTestRules}
                                    disabled={testRulesMutation.isPending}>
                                    Test Rules
                                </Button>
                            </Box>
                        </Box>

                        <Typography variant="body2" color="textSecondary" paragraph>
                            Rules help identify specific types of transfers automatically.
                            Use regex patterns or simple text matching.
                        </Typography>

                        {/* Rules List */}
                        <Box sx={{ mt: 2 }}>
                            {settings.transfers.rules.map((rule, index) => (
                                <Accordion key={index}>
                                    <AccordionSummary expandIcon={<ExpandMore />}>
                                        <Box display="flex" alignItems="center" gap={2} width="100%">
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={rule.enabled}
                                                        onChange={(e) => handleUpdateRule(index, { enabled: e.target.checked })}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                }
                                                label=""
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <Box flexGrow={1}>
                                                <Typography variant="body1" fontWeight="medium">
                                                    {rule.name}
                                                </Typography>
                                                <Typography variant="caption" color="textSecondary">
                                                    Pattern: {rule.pattern || 'Not set'}
                                                </Typography>
                                            </Box>
                                            <Box display="flex" gap={1}>
                                                {rule.autoConfirm && (
                                                    <Chip label="Auto-confirm" size="small" color="success" />
                                                )}
                                                {rule.allowFees && (
                                                    <Chip label={`Fees: ${rule.maxFeeTolerance} CHF`} size="small" color="warning" />
                                                )}
                                            </Box>
                                        </Box>
                                    </AccordionSummary>
                                    <AccordionDetails>
                                        <Grid container spacing={2}>
                                            <Grid item xs={12} md={6}>
                                                <TextField
                                                    fullWidth
                                                    label="Rule Name"
                                                    value={rule.name}
                                                    onChange={(e) => handleUpdateRule(index, { name: e.target.value })}
                                                    size="small"
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={6}>
                                                <TextField
                                                    fullWidth
                                                    label="Pattern (regex or text)"
                                                    value={rule.pattern}
                                                    onChange={(e) => handleUpdateRule(index, { pattern: e.target.value })}
                                                    size="small"
                                                    sx={{ fontFamily: 'monospace' }}
                                                />
                                            </Grid>
                                            <Grid item xs={12}>
                                                <TextField
                                                    fullWidth
                                                    label="Description"
                                                    value={rule.description}
                                                    onChange={(e) => handleUpdateRule(index, { description: e.target.value })}
                                                    size="small"
                                                    multiline
                                                    rows={2}
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={4}>
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            checked={rule.autoConfirm}
                                                            onChange={(e) => handleUpdateRule(index, { autoConfirm: e.target.checked })}
                                                        />
                                                    }
                                                    label="Auto-confirm matches"
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={4}>
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            checked={rule.allowFees}
                                                            onChange={(e) => handleUpdateRule(index, { allowFees: e.target.checked })}
                                                        />
                                                    }
                                                    label="Allow fees"
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={4}>
                                                <TextField
                                                    fullWidth
                                                    label="Max Fee (CHF)"
                                                    type="number"
                                                    value={rule.maxFeeTolerance}
                                                    onChange={(e) => handleUpdateRule(index, { maxFeeTolerance: parseFloat(e.target.value) || 0 })}
                                                    disabled={!rule.allowFees}
                                                    size="small"
                                                    inputProps={{ step: 0.1, min: 0 }}
                                                />
                                            </Grid>
                                            <Grid item xs={12}>
                                                <Box display="flex" justifyContent="flex-end">
                                                    <IconButton
                                                        color="error"
                                                        onClick={() => handleDeleteRule(index)}
                                                        size="small">
                                                        <Delete />
                                                    </IconButton>
                                                </Box>
                                            </Grid>
                                        </Grid>
                                    </AccordionDetails>
                                </Accordion>
                            ))}
                        </Box>

                        {settings.transfers.rules.length === 0 && (
                            <Box textAlign="center" py={3}>
                                <Pattern sx={{ fontSize: 48, color: 'action.disabled', mb: 2 }} />
                                <Typography variant="h6" color="textSecondary" gutterBottom>
                                    No transfer rules configured
                                </Typography>
                                <Typography variant="body2" color="textSecondary" paragraph>
                                    Add rules to automatically detect specific types of transfers
                                </Typography>
                                <Button
                                    variant="contained"
                                    startIcon={<Add />}
                                    onClick={() => setAddRuleOpen(true)}>
                                    Add Your First Rule
                                </Button>
                            </Box>
                        )}
                    </CardContent>
                </Card>

                {/* Test Results */}
                {testResults && (
                    <Card sx={{ mt: 3 }}>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={1} mb={2}>
                                <Preview />
                                <Typography variant="h6">Test Results</Typography>
                            </Box>

                            <Alert severity="info" sx={{ mb: 2 }}>
                                Found {testResults.matches} potential transfers in the last {settings.transfers.daysLookback} days
                            </Alert>

                            {testResults.samples && testResults.samples.length > 0 && (
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>From</TableCell>
                                                <TableCell>To</TableCell>
                                                <TableCell>Amount</TableCell>
                                                <TableCell>Confidence</TableCell>
                                                <TableCell>Matched Rule</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {testResults.samples.map((sample: any, index: number) => (
                                                <TableRow key={index}>
                                                    <TableCell>{sample.from_description}</TableCell>
                                                    <TableCell>{sample.to_description}</TableCell>
                                                    <TableCell>{sample.amount} CHF</TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={`${(sample.confidence * 100).toFixed(0)}%`}
                                                            color={sample.confidence >= settings.transfers.confidenceThreshold ? 'success' : 'warning'}
                                                            size="small"
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        {sample.matched_rule || 'General pattern'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </CardContent>
                    </Card>
                )}
            </TabPanel>

            {/* Add Rule Dialog */}
            <Dialog open={addRuleOpen} onClose={() => setAddRuleOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Add Transfer Rule</DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2 }}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Rule Name"
                                    value={newRule.name}
                                    onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g., Personal Transfers"
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Pattern"
                                    value={newRule.pattern}
                                    onChange={(e) => setNewRule(prev => ({ ...prev, pattern: e.target.value }))}
                                    placeholder="e.g., YOUR_NAME|REVOLUT"
                                    sx={{ fontFamily: 'monospace' }}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Description"
                                    value={newRule.description}
                                    onChange={(e) => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                                    multiline
                                    rows={2}
                                    placeholder="Describe when this rule should apply"
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={newRule.autoConfirm}
                                            onChange={(e) => setNewRule(prev => ({ ...prev, autoConfirm: e.target.checked }))}
                                        />
                                    }
                                    label="Auto-confirm matches"
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={newRule.allowFees}
                                            onChange={(e) => setNewRule(prev => ({ ...prev, allowFees: e.target.checked }))}
                                        />
                                    }
                                    label="Allow fees"
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Max Fee (CHF)"
                                    type="number"
                                    value={newRule.maxFeeTolerance}
                                    onChange={(e) => setNewRule(prev => ({ ...prev, maxFeeTolerance: parseFloat(e.target.value) || 0 }))}
                                    disabled={!newRule.allowFees}
                                    inputProps={{ step: 0.1, min: 0 }}
                                />
                            </Grid>
                        </Grid>

                        <Alert severity="info" sx={{ mt: 2 }}>
                            <Typography variant="body2">
                                <strong>Pattern Tips:</strong>
                                <br />• Use simple text for exact matches: "REVOLUT"
                                <br />• Use | for OR conditions: "SPAREN|SAVING"
                                <br />• Use regex for complex patterns: "^.*TRANSFER.*$"
                                <br />• Case insensitive matching is used
                            </Typography>
                        </Alert>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddRuleOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddRule} variant="contained">
                        Add Rule
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}