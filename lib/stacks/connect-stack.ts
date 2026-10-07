/**
 * Connect Stack for Amazon Connect Web Application.
 * 
 * This stack manages Amazon Connect contact flows for WebRTC and Chat functionality.
 * It loads contact flow definitions from source files, validates them, and deploys
 * them to the Amazon Connect instance.
 * 
 * Validates: Requirements 3.3, 3.4, 8.1, 8.2, 8.3, 8.4, 8.5, 11.1, 11.2
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as connect from 'aws-cdk-lib/aws-connect';
import * as fs from 'fs';
import * as path from 'path';
import { EnvironmentConfig } from '../config/config-schema';
import { ConnectSecurity } from './connect-security';
import { ConnectRouting } from './connect-routing';

/**
 * Properties for the ConnectStack.
 */
export interface ConnectStackProps extends cdk.StackProps {
  /** Complete environment configuration */
  config: EnvironmentConfig;
  
  /** Authenticated role ARN for permissions */
  authenticatedRoleArn: string;
}

/**
 * Interface for contact flow metadata.
 */
interface ContactFlowMetadata {
  name: string;
  description: string;
  type: string;
  content: string;
}

/**
 * Connect Stack that creates Amazon Connect contact flows.
 * 
 * This stack provides:
 * - Reference to existing Amazon Connect instance
 * - WebRTC contact flows loaded from source files
 * - Chat contact flows loaded from source files
 * - Contact flow validation before deployment
 * - Exports for contact flow IDs and instance ARN
 */
export class ConnectStack extends cdk.Stack {
  /** Map of contact flow names to CfnContactFlow resources */
  public readonly contactFlows: Map<string, connect.CfnContactFlow>;
  
  /** Amazon Connect instance ARN */
  public readonly instanceArn: string;
  
  /** Security profile for agents */
  public readonly security: ConnectSecurity;

  /** Routing profile for agents */
  public readonly routing: ConnectRouting;

  /** Map of contact flow names to their IDs */
  public readonly contactFlowIds: Map<string, string>;

  constructor(scope: Construct, id: string, props: ConnectStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Validate that instance ARN is provided
    if (!config.connect.instanceArn) {
      throw new Error(
        'Amazon Connect instance ARN is required in configuration. ' +
        'Please add "instanceArn" to the connect section of your environment configuration.'
      );
    }

    this.instanceArn = config.connect.instanceArn;
    this.contactFlows = new Map();
    this.contactFlowIds = new Map();

    // Load and deploy contact flows from generated files
    // The generated directory contains contact flows with placeholders replaced
    const contactFlowsPath = path.join(config.connect.contactFlowsPath, 'generated');

    // Validate path doesn't contain traversal sequences
    const resolvedFlowsPath = path.resolve(contactFlowsPath);
    if (!resolvedFlowsPath.startsWith(path.resolve('.'))) {
      throw new Error(`Contact flows path resolves outside project directory: ${contactFlowsPath}`);
    }
    
    // Validate contact flows directory exists
    if (!fs.existsSync(resolvedFlowsPath)) {
      throw new Error(
        `Generated contact flows directory not found: ${contactFlowsPath}. ` +
        `Please run "npm run update-contact-flows" to generate contact flow files from templates.`
      );
    }

    // Load WebRTC contact flows (using validated resolvedFlowsPath)
    const webrtcFlowPath = path.join(resolvedFlowsPath, 'webrtc-queue-routing.json');
    if (fs.existsSync(webrtcFlowPath)) {
      const webrtcFlow = this.loadContactFlow(webrtcFlowPath, 'WebRTC Queue Routing');
      this.createContactFlow('WebRTCQueueRouting', webrtcFlow);
    } else {
      cdk.Annotations.of(this).addWarning(
        `WebRTC contact flow not found at ${webrtcFlowPath}. Skipping WebRTC flow deployment.`
      );
    }

    // Load Chat contact flows (using validated resolvedFlowsPath)
    const chatFlowPath = path.join(resolvedFlowsPath, 'chat-agent-routing.json');
    if (fs.existsSync(chatFlowPath)) {
      const chatFlow = this.loadContactFlow(chatFlowPath, 'Chat Agent Routing');
      this.createContactFlow('ChatAgentRouting', chatFlow);
    } else {
      cdk.Annotations.of(this).addWarning(
        `Chat contact flow not found at ${chatFlowPath}. Skipping Chat flow deployment.`
      );
    }

    this.security = new ConnectSecurity(this, 'Security', { instanceArn: this.instanceArn });

    this.routing = new ConnectRouting(this, 'Routing', {
      instanceArn: this.instanceArn,
      queueArn: `${this.instanceArn}/queue/${config.connect.queueId}`,
    });

    // Export instance ARN
    new cdk.CfnOutput(this, 'InstanceArnOutput', {
      value: this.instanceArn,
      description: 'Amazon Connect instance ARN',
      exportName: `${this.stackName}-InstanceArn`,
    });

    // Export contact flow IDs
    this.contactFlowIds.forEach((flowId, flowName) => {
      new cdk.CfnOutput(this, `${flowName}IdOutput`, {
        value: flowId,
        description: `Contact Flow ID for ${flowName}`,
        exportName: `${this.stackName}-${flowName}Id`,
      });
    });

    // Apply tags to all resources
    cdk.Tags.of(this).add('Application', 'ConnectWebApp');
    
    // Apply custom tags from configuration
    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }

  /**
   * Loads a contact flow from a JSON file and validates its structure.
   * 
   * @param filePath - Path to contact flow JSON file
   * @param defaultName - Default name if not specified in metadata
   * @returns Contact flow metadata
   * @throws Error if file cannot be read or JSON is invalid
   */
  private loadContactFlow(filePath: string, defaultName: string): ContactFlowMetadata {
    try {
      // Read contact flow JSON file
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      
      // Parse JSON to validate structure
      const flowJson = JSON.parse(fileContent);
      
      // Validate required fields
      this.validateContactFlowJson(flowJson, filePath);
      
      // Extract metadata
      const name = flowJson.Metadata?.name || defaultName;
      const description = flowJson.Metadata?.description || '';
      const type = flowJson.Metadata?.type || 'contactFlow';
      
      return {
        name,
        description,
        type,
        content: fileContent,
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `Invalid JSON in contact flow file ${filePath}: ${error.message}`
        );
      }
      throw new Error(
        `Failed to load contact flow from ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validates contact flow JSON structure.
   * 
   * @param flowJson - Parsed contact flow JSON
   * @param filePath - File path for error messages
   * @throws Error if validation fails
   */
  private validateContactFlowJson(flowJson: any, filePath: string): void {
    const errors: string[] = [];

    // Validate required top-level fields
    if (!flowJson.Version) {
      errors.push('Missing required field: Version');
    }

    if (!flowJson.StartAction) {
      errors.push('Missing required field: StartAction');
    }

    if (!flowJson.Actions || !Array.isArray(flowJson.Actions)) {
      errors.push('Missing or invalid required field: Actions (must be an array)');
    } else if (flowJson.Actions.length === 0) {
      errors.push('Actions array cannot be empty');
    }

    if (!flowJson.Metadata) {
      errors.push('Missing required field: Metadata');
    }

    // Validate Actions structure
    if (flowJson.Actions && Array.isArray(flowJson.Actions)) {
      flowJson.Actions.forEach((action: any, index: number) => {
        if (!action.Identifier) {
          errors.push(`Action at index ${index} is missing required field: Identifier`);
        }
        if (!action.Type) {
          errors.push(`Action at index ${index} is missing required field: Type`);
        }
      });
    }

    // Throw error if any validation errors occurred
    if (errors.length > 0) {
      throw new Error(
        `Contact flow validation failed for ${filePath}:\n${errors.map(e => `  - ${e}`).join('\n')}`
      );
    }
  }

  /**
   * Creates a CfnContactFlow resource from contact flow metadata.
   * 
   * @param logicalId - CloudFormation logical ID for the resource
   * @param flowMetadata - Contact flow metadata
   */
  private createContactFlow(
    logicalId: string,
    flowMetadata: ContactFlowMetadata
  ): void {
    // Create CfnContactFlow resource
    const contactFlow = new connect.CfnContactFlow(this, logicalId, {
      instanceArn: this.instanceArn,
      name: flowMetadata.name,
      description: flowMetadata.description,
      type: this.mapContactFlowType(flowMetadata.type),
      content: flowMetadata.content,
      
      // Apply tags
      tags: [
        {
          key: 'Name',
          value: flowMetadata.name,
        },
        {
          key: 'ManagedBy',
          value: 'CDK',
        },
      ],
    });

    // Store contact flow reference
    this.contactFlows.set(flowMetadata.name, contactFlow);
    
    // Store contact flow ID for exports
    // Use Fn::GetAtt to get the ContactFlowArn, then extract the ID
    this.contactFlowIds.set(logicalId, contactFlow.attrContactFlowArn);
  }

  /**
   * Maps contact flow type string to CloudFormation type enum.
   * 
   * @param type - Contact flow type from metadata
   * @returns CloudFormation contact flow type
   */
  private mapContactFlowType(type: string): string {
    const typeMap: Record<string, string> = {
      'contactFlow': 'CONTACT_FLOW',
      'customerQueue': 'CUSTOMER_QUEUE',
      'customerHold': 'CUSTOMER_HOLD',
      'customerWhisper': 'CUSTOMER_WHISPER',
      'agentHold': 'AGENT_HOLD',
      'agentWhisper': 'AGENT_WHISPER',
      'transferToAgent': 'TRANSFER_TO_AGENT',
      'transferToQueue': 'TRANSFER_TO_QUEUE',
      'agentTransfer': 'AGENT_TRANSFER',
      'queueTransfer': 'QUEUE_TRANSFER',
    };

    const mappedType = typeMap[type];
    if (!mappedType) {
      // Default to CONTACT_FLOW if type is not recognized
      cdk.Annotations.of(this).addWarning(
        `Unknown contact flow type: ${type}. Defaulting to CONTACT_FLOW.`
      );
      return 'CONTACT_FLOW';
    }

    return mappedType;
  }
}
