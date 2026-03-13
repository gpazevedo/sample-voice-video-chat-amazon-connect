/**
 * Configuration Manager for Amazon Connect Web Application CDK infrastructure.
 * 
 * This class handles loading, merging, and validating configuration from multiple sources:
 * - CDK context (cdk.json)
 * - Environment-specific config files (config/{env}.json)
 * - AWS Secrets Manager (for sensitive values)
 * - AWS Systems Manager Parameter Store (for application parameters)
 * 
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 */

import * as fs from 'fs';
import * as path from 'path';
import { EnvironmentConfig } from './config-schema';
import { 
  SecretsManagerClient, 
  GetSecretValueCommand,
  SecretsManagerServiceException 
} from '@aws-sdk/client-secrets-manager';
import { 
  SSMClient, 
  GetParametersCommand,
  SSMServiceException 
} from '@aws-sdk/client-ssm';

/**
 * Configuration Manager class for loading and validating environment configuration.
 */
export class ConfigurationManager {
  private readonly configDir: string;
  private secretsClient?: SecretsManagerClient;
  private ssmClient?: SSMClient;

  /**
   * Creates a new ConfigurationManager instance.
   * 
   * @param configDir - Directory containing environment-specific config files (default: './config')
   * @param cdkContext - CDK context object from cdk.json (optional, reserved for future use)
   */
  constructor(configDir: string = './config', cdkContext?: any) {
    this.configDir = configDir;
    // cdkContext reserved for future configuration merging functionality
    void cdkContext;
  }

  /**
   * Loads and merges configuration for the specified environment.
   * 
   * Configuration is loaded in the following order (later sources override earlier ones):
   * 1. Base configuration from cdk.json context
   * 2. Environment-specific configuration from config/{env}.json
   * 
   * @param environment - Target environment (dev, staging, or prod)
   * @returns Merged and validated environment configuration
   * @throws Error if configuration file is missing or invalid
   * 
   * Validates: Requirements 9.1
   */
  loadConfig(environment: string): EnvironmentConfig {
    // Validate environment parameter
    if (!environment || typeof environment !== 'string') {
      throw new Error(
        'Invalid environment parameter. Must be a non-empty string (dev, staging, or prod).'
      );
    }

    // Construct path to environment-specific config file
    const configPath = path.join(this.configDir, `${environment}.json`);

    // Check if config file exists
    if (!fs.existsSync(configPath)) {
      throw new Error(
        `Configuration file not found: ${configPath}. ` +
        `Please create a configuration file for the '${environment}' environment.`
      );
    }

    // Load environment-specific configuration
    let envConfig: EnvironmentConfig;
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      envConfig = JSON.parse(configContent);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `Invalid JSON in configuration file ${configPath}: ${error.message}`
        );
      }
      throw new Error(
        `Failed to read configuration file ${configPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Merge with CDK context if available
    const mergedConfig = this.mergeConfigurations(envConfig);

    // Validate the merged configuration
    this.validateConfig(mergedConfig);

    return mergedConfig;
  }

  /**
   * Merges environment-specific configuration with CDK context.
   * Environment-specific values take precedence over context values.
   * 
   * @param envConfig - Environment-specific configuration
   * @returns Merged configuration
   */
  private mergeConfigurations(envConfig: EnvironmentConfig): EnvironmentConfig {
    // For now, environment config takes full precedence
    // In the future, we could merge specific fields from CDK context
    return envConfig;
  }

  /**
   * Validates configuration schema and required fields.
   * 
   * @param config - Configuration to validate
   * @throws Error if configuration is invalid or missing required fields
   * 
   * Validates: Requirements 9.1
   */
  private validateConfig(config: EnvironmentConfig): void {
    const errors: string[] = [];

    // Validate top-level required fields
    if (!config.account || typeof config.account !== 'string') {
      errors.push('Missing or invalid required field: account');
    }

    if (!config.region || typeof config.region !== 'string') {
      errors.push('Missing or invalid required field: region');
    }

    // Validate Cognito configuration
    if (!config.cognito) {
      errors.push('Missing required section: cognito');
    } else {
      if (!config.cognito.userPoolName) {
        errors.push('Missing required field: cognito.userPoolName');
      }

      if (!config.cognito.passwordPolicy) {
        errors.push('Missing required section: cognito.passwordPolicy');
      } else {
        const pp = config.cognito.passwordPolicy;
        if (typeof pp.minLength !== 'number' || pp.minLength < 6) {
          errors.push('Invalid cognito.passwordPolicy.minLength (must be a number >= 6)');
        }
        if (typeof pp.requireLowercase !== 'boolean') {
          errors.push('Invalid cognito.passwordPolicy.requireLowercase (must be boolean)');
        }
        if (typeof pp.requireUppercase !== 'boolean') {
          errors.push('Invalid cognito.passwordPolicy.requireUppercase (must be boolean)');
        }
        if (typeof pp.requireNumbers !== 'boolean') {
          errors.push('Invalid cognito.passwordPolicy.requireNumbers (must be boolean)');
        }
        if (typeof pp.requireSymbols !== 'boolean') {
          errors.push('Invalid cognito.passwordPolicy.requireSymbols (must be boolean)');
        }
        if (typeof pp.tempPasswordValidity !== 'number' || pp.tempPasswordValidity < 1) {
          errors.push('Invalid cognito.passwordPolicy.tempPasswordValidity (must be a number >= 1)');
        }
      }

      if (!['OFF', 'OPTIONAL', 'REQUIRED'].includes(config.cognito.mfaConfiguration)) {
        errors.push('Invalid cognito.mfaConfiguration (must be OFF, OPTIONAL, or REQUIRED)');
      }

      if (!Array.isArray(config.cognito.autoVerifiedAttributes)) {
        errors.push('Invalid cognito.autoVerifiedAttributes (must be an array)');
      }
    }

    // Validate Storage configuration
    if (!config.storage) {
      errors.push('Missing required section: storage');
    } else {
      if (!config.storage.hostingBucketName) {
        errors.push('Missing required field: storage.hostingBucketName');
      }

      if (!Array.isArray(config.storage.lifecyclePolicies)) {
        errors.push('Invalid storage.lifecyclePolicies (must be an array)');
      }
    }

    // Validate Distribution configuration
    if (!config.distribution) {
      errors.push('Missing required section: distribution');
    } else {
      if (!config.distribution.priceClass) {
        errors.push('Missing required field: distribution.priceClass');
      }

      if (!Array.isArray(config.distribution.cacheBehaviors)) {
        errors.push('Invalid distribution.cacheBehaviors (must be an array)');
      }
    }

    // Validate Connect configuration
    if (!config.connect) {
      errors.push('Missing required section: connect');
    } else {
      if (!config.connect.contactFlowsPath) {
        errors.push('Missing required field: connect.contactFlowsPath');
      }
    }

    // Validate tags
    if (!config.tags || typeof config.tags !== 'object') {
      errors.push('Missing or invalid required field: tags (must be an object)');
    }

    // Throw error if any validation errors occurred
    if (errors.length > 0) {
      throw new Error(
        `Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`
      );
    }
  }

  /**
   * Loads secrets from AWS Secrets Manager.
   * 
   * Implements retry logic with exponential backoff for transient failures.
   * 
   * @param secretNames - Array of secret names to retrieve
   * @param region - AWS region (optional, uses config region if not specified)
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Object mapping secret names to their values
   * @throws Error if secrets cannot be retrieved after retries
   * 
   * Validates: Requirements 9.2, 9.4
   */
  async loadSecrets(
    secretNames: string[], 
    region?: string, 
    maxRetries: number = 3
  ): Promise<Record<string, string>> {
    if (!secretNames || secretNames.length === 0) {
      return {};
    }

    // Initialize Secrets Manager client if not already done
    if (!this.secretsClient) {
      this.secretsClient = new SecretsManagerClient({ 
        region: region || process.env.AWS_REGION 
      });
    }

    const secrets: Record<string, string> = {};
    const errors: string[] = [];

    // Retrieve each secret with retry logic
    for (const secretName of secretNames) {
      let lastError: Error | undefined;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const command = new GetSecretValueCommand({ SecretId: secretName });
          const response = await this.secretsClient.send(command);
          
          if (response.SecretString) {
            secrets[secretName] = response.SecretString;
            break; // Success, move to next secret
          } else {
            throw new Error(`Secret ${secretName} has no SecretString value`);
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // Don't retry on certain errors
          if (error instanceof SecretsManagerServiceException) {
            if (error.name === 'ResourceNotFoundException') {
              errors.push(`Secret not found: ${secretName}`);
              break; // Don't retry for not found
            }
            if (error.name === 'AccessDeniedException') {
              errors.push(`Access denied to secret: ${secretName}`);
              break; // Don't retry for permission errors
            }
          }
          
          // Exponential backoff before retry
          if (attempt < maxRetries - 1) {
            await this.sleep(Math.pow(2, attempt) * 1000);
          }
        }
      }

      // If we exhausted retries, add to errors
      if (!secrets[secretName] && lastError) {
        errors.push(
          `Failed to retrieve secret ${secretName} after ${maxRetries} attempts: ${lastError.message}`
        );
      }
    }

    // Throw error if any secrets failed to load
    if (errors.length > 0) {
      throw new Error(
        `Failed to load secrets from AWS Secrets Manager:\n${errors.map(e => `  - ${e}`).join('\n')}\n` +
        `Verify that the secrets exist and IAM permissions are correct.`
      );
    }

    return secrets;
  }

  /**
   * Loads parameters from AWS Systems Manager Parameter Store.
   * 
   * Implements retry logic with exponential backoff for transient failures.
   * Supports batch retrieval for efficiency.
   * 
   * @param parameterPaths - Array of parameter paths to retrieve
   * @param region - AWS region (optional, uses config region if not specified)
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Object mapping parameter paths to their values
   * @throws Error if parameters cannot be retrieved after retries
   * 
   * Validates: Requirements 9.3, 9.4
   */
  async loadParameters(
    parameterPaths: string[], 
    region?: string, 
    maxRetries: number = 3
  ): Promise<Record<string, string>> {
    if (!parameterPaths || parameterPaths.length === 0) {
      return {};
    }

    // Initialize SSM client if not already done
    if (!this.ssmClient) {
      this.ssmClient = new SSMClient({ 
        region: region || process.env.AWS_REGION 
      });
    }

    const parameters: Record<string, string> = {};
    const errors: string[] = [];

    // SSM GetParameters supports up to 10 parameters per request
    const batchSize = 10;
    for (let i = 0; i < parameterPaths.length; i += batchSize) {
      const batch = parameterPaths.slice(i, i + batchSize);
      let lastError: Error | undefined;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const command = new GetParametersCommand({ 
            Names: batch,
            WithDecryption: true // Decrypt SecureString parameters
          });
          const response = await this.ssmClient.send(command);

          // Store successfully retrieved parameters
          if (response.Parameters) {
            for (const param of response.Parameters) {
              if (param.Name && param.Value) {
                parameters[param.Name] = param.Value;
              }
            }
          }

          // Check for invalid parameters
          if (response.InvalidParameters && response.InvalidParameters.length > 0) {
            for (const invalidParam of response.InvalidParameters) {
              errors.push(`Parameter not found: ${invalidParam}`);
            }
          }

          break; // Success, move to next batch
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Don't retry on certain errors
          if (error instanceof SSMServiceException) {
            if (error.name === 'AccessDeniedException') {
              errors.push(`Access denied to parameters: ${batch.join(', ')}`);
              break; // Don't retry for permission errors
            }
          }

          // Exponential backoff before retry
          if (attempt < maxRetries - 1) {
            await this.sleep(Math.pow(2, attempt) * 1000);
          }
        }
      }

      // If we exhausted retries for this batch, add to errors
      if (lastError && batch.some(p => !parameters[p])) {
        errors.push(
          `Failed to retrieve parameters after ${maxRetries} attempts: ${lastError.message}`
        );
      }
    }

    // Throw error if any parameters failed to load
    if (errors.length > 0) {
      throw new Error(
        `Failed to load parameters from AWS Systems Manager Parameter Store:\n${errors.map(e => `  - ${e}`).join('\n')}\n` +
        `Verify that the parameters exist and IAM permissions are correct.`
      );
    }

    return parameters;
  }

  /**
   * Helper method to sleep for a specified duration.
   * Used for implementing exponential backoff in retry logic.
   * 
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
