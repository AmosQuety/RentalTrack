# 🏠 RentalTrack - Property Management App
A modern, offline-first React Native mobile application for landlords to manage tenants, track rent payments, and automate reminders.

![React Native](https://img.shields.io/badge/React_Native-0.81.5-61DAFB?style=for-square&logo=react)![Expo](https://img.shields.io/badge/Expo-54.0.20-000020?style=for-square&logo=expo)![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-3178C6?style=for-square&logo=typescript)![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-square&logo=sqlite)

## 📱 Features

### 🏠 Tenant Management
- Add, edit, and delete tenant profiles
- Room number validation (prevents duplicates)
- Contact information and notes
- Contract dates tracking

### 💰 Payment Tracking
- Record rent payments with multiple methods
- Automatic credit balance calculation
- Payment history with detailed breakdowns
- Partial payment support

### 🔔 Smart Reminders
- Automated rent due notifications
- Configurable reminder timing
- Actionable notifications (Mark as Paid, Snooze)
- Local push notifications

### 📊 Analytics & Insights
- Payment trends and statistics
- Monthly collection reports
- Overdue tracking
- Visual charts and graphs

### ⚙️ Advanced Features
- **Offline-first** - Works completely offline
- Multiple rent cycles (Monthly, Bi-weekly, Quarterly)
- Auto-suspend for overdue tenants
- Contract expiration reminders
- Dark/Light theme support

## 🛠 Tech Stack
- **Frontend:** React Native 0.81.5, Expo 54.0.20
- **Language:** TypeScript 5.9.2
- **Database:** SQLite with `expo-sqlite`
- **Navigation:** Expo Router (File-based routing)
- **Notifications:** Expo Notifications
- **UI Components:** Custom design system
- **State Management:** React Hooks + Context

## 📁 Project Structure
```text
RentalTrack/
├── app/                    # Expo Router app directory
│   ├── (tabs)/            # Tab navigation
│   │   ├── index.tsx      # Dashboard
│   │   ├── tenants.tsx    # Tenants list
│   │   ├── analytics.tsx  # Analytics
│   │   └── reminders.tsx  # Reminders
│   ├── add-tenant.tsx     # Add tenant form
│   ├── edit-tenant.tsx    # Edit tenant form
│   ├── tenant-details.tsx # Tenant details view
│   └── record-payment.tsx # Payment recording
├── components/            # Reusable components
│   ├── DateInput.tsx     # Smart date input
│   └── ErrorBoundary.tsx # Error handling
├── hooks/                 # Custom React hooks
│   ├── use-db.ts         # Database operations
│   └── use-auto-refresh.ts # Auto-refresh logic
├── libs/                  # Type definitions
│   └── types.ts          # TypeScript interfaces
├── services/              # Business logic
│   ├── notifications.ts  # Notification service
│   └── database.ts       # Database layer
└── utils/                 # Utilities
    └── dateParser.ts     # Date parsing logic

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Expo CLI
- Android Studio / Xcode (for emulators)

### Installation
1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/rentaltrack.git
    cd rentaltrack
    ```
2.  **Install dependencies**
    ```bash
    npm install
    ```
3.  **Start development server**
    ```bash
    npx expo start
    ```

### Building for Production
```bash
# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios
```

---

## 📊 Database Schema
The app uses SQLite with the following main tables:
- **tenants** - Tenant information and status
- **payments** - Payment records and calculations
- **reminders** - Scheduled notifications
- **settings** - User preferences
- **payment_cancellations** - Audit trail for cancelled payments

---

## 🎯 Key Features Explained

### 🔄 Auto-Refresh System
Components automatically refresh when data changes using a custom hook system that listens to database events.

### 💡 Smart Payment Calculations
- Tracks credit balances across payments
- Handles partial payments gracefully
- Calculates next due dates automatically
- Supports different rent cycles

### 📅 Intelligent Date Handling
- Smart date parser with multiple input formats
- Quick-select options (Today, Yesterday, Tomorrow)
- Calendar picker integration
- Date validation and formatting

---

## 🤝 Contributing
We welcome contributions! Please see our **Contributing Guide** for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License
This project is licensed under the MIT License - see the `LICENSE` file for details.

## 🏢 Commercial Use
This app is designed for individual landlords and small property managers. It's perfect for:
- Individual property owners
- Small rental businesses
- Real estate agents
- Vacation rental hosts

## 💼 Business Model
- One-time purchase model
- Offline-first for data privacy
- No subscription fees
- Customizable for different markets

## 🔒 Privacy & Security
- ✅ **Offline-first** - All data stays on your device
- ✅ **No cloud dependencies** - Works without an internet connection
- ✅ **Local database** - SQLite encryption available
- ✅ **No tracking** - Complete user privacy

## 📞 Support
- **Documentation:** GitHub Wiki
- **Issues:** GitHub Issues
- **Email:** support@rentaltrack.app

## 🚀 Roadmap
- [ ] Multi-language support
- [ ] Cloud backup options (e.g., iCloud/Google Drive)
- [ ] PDF receipt generation
- [ ] SMS reminder integration
- [ ] Web dashboard version

<br>

<p align="center">
  Built with ❤️ for landlords worldwide
</p>