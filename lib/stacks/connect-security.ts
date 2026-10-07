/**
 * Security profile for web app agents.
 */

import { Construct } from 'constructs';
import * as connect from 'aws-cdk-lib/aws-connect';

export interface ConnectSecurityProps {
  /** ARN of the existing Connect instance */
  instanceArn: string;
}

/**
 * Creates a security profile letting agents use the CCP with audio and video.
 */
export class ConnectSecurity extends Construct {
  public readonly securityProfile: connect.CfnSecurityProfile;

  constructor(scope: Construct, id: string, props: ConnectSecurityProps) {
    super(scope, id);

    this.securityProfile = new connect.CfnSecurityProfile(this, 'SecurityProfile', {
      instanceArn: props.instanceArn,
      securityProfileName: 'WebAppAgent',
      description: 'Agent access with audio device settings and video contacts',
      permissions: ['BasicAgentAccess', 'AudioDeviceSettings.Access', 'VideoContact.Access'],
    });
  }
}
