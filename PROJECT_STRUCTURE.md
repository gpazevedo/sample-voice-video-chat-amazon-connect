# Project Structure

```
├── images/
│   ├── wholeSolution.png                # Full solution architecture diagram
│   ├── frontend.png                     # Frontend web application components diagram
│   └── backend.png                      # AWS backend services diagram
├── bin/
│   └── connect-web-app.ts              # CDK application entry point
├── contact-flows/
│   ├── chat-agent-routing.json          # Chat routing contact flow template
│   └── webrtc-queue-routing.json        # WebRTC queue routing contact flow template
├── lib/
│   ├── aspects/
│   │   └── security-aspect.ts           # CDK Nag security validation
│   ├── config/
│   │   ├── config-schema.ts             # TypeScript configuration interfaces
│   │   └── configuration-manager.ts     # Configuration loading and validation
│   └── stacks/
│       ├── authentication-stack.ts      # Cognito User Pool + Identity Pool
│       ├── connect-stack.ts             # Amazon Connect resources
│       ├── distribution-stack.ts        # CloudFront distribution
│       ├── iam-stack.ts                 # IAM roles and policies
│       └── storage-stack.ts             # S3 buckets for hosting
├── scripts/
│   ├── check-environment.js            # Environment setup validation
│   ├── deploy-to-s3.js                 # Deploy application files to S3
│   ├── embed-config.js                 # Embed config into HTML for production
│   ├── extract-chat-widget-ids.js      # Extract chat widget IDs from script
│   ├── generate-cdk-config.js          # Generate CDK infrastructure config
│   ├── generate-config.js              # Generate runtime configuration
│   ├── update-contact-flows.js         # Generate contact flows from templates
│   ├── update-csp-regions.js           # Update CSP with all Amazon Connect regions
│   ├── update-cloudfront-function-headers.js # Manual CloudFront Function CSP updates
│   └── update-env-from-cdk-outputs.js  # Update .env with CDK outputs
├── src/
│   ├── config/
│   │   └── ConfigManager.ts             # Runtime configuration management
│   ├── managers/
│   │   ├── AuthenticationStateManager.ts # Cognito authentication state
│   │   ├── ChatManager.ts               # Chat stub (chat handled by Standard Widget)
│   │   ├── CredentialManager.ts         # AWS credential management
│   │   ├── SessionManager.ts            # Session coordination
│   │   └── WebRTCManager.ts             # WebRTC session management
│   ├── models/
│   │   ├── call.ts                      # WebRTC call types
│   │   ├── chat.ts                      # Chat types
│   │   ├── error.ts                     # Error types
│   │   ├── file.ts                      # File types
│   │   ├── index.ts                     # Model exports
│   │   └── session.ts                   # Session types
│   ├── ui/
│   │   ├── error-display.css            # Error display styles
│   │   ├── login.css                    # Login form styles
│   │   ├── LoginComponent.ts            # Cognito login component
│   │   ├── styles.css                   # Main application styles
│   │   └── UIController.ts              # UI controller
│   ├── utils/
│   │   ├── credentialSanitization.ts    # Credential sanitization
│   │   ├── credentialStoragePrevention.ts # Prevent credential storage
│   │   ├── errorHandling.ts             # Error handling utilities
│   │   ├── index.ts                     # Utility exports
│   │   ├── networkErrorHandler.ts       # Network error handling
│   │   └── security.ts                  # Security utilities
│   ├── AmazonConnectApp.ts              # Main application class
│   └── index.ts                         # Application entry point
├── .env.example                         # Environment configuration template
├── .eslintrc.js                        # ESLint configuration
├── .gitignore                           # Git ignore rules
├── AmazonConnectLogo.png                # Application logo
├── CDK_STACKS.md                        # CDK stack architecture and dependencies
├── cdk.json                             # CDK configuration
├── index.html.template                  # Main application interface (template)
├── LICENSE.txt                          # Project license
├── package.json                         # NPM dependencies and scripts
├── package-lock.json                    # NPM dependency lock file
├── PROJECT_STRUCTURE.md                 # This file - project structure documentation
├── README.md                            # Project documentation
├── server.js                            # Local development server
├── tsconfig.json                        # TypeScript configuration
├── tsconfig.webpack.json                # TypeScript configuration for webpack
└── webpack.config.js                    # Webpack build configuration
```
