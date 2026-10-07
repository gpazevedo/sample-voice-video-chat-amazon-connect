/**
 * Routing profile for the Connect instance.
 */

import { Construct } from 'constructs';
import * as connect from 'aws-cdk-lib/aws-connect';

export interface ConnectRoutingProps {
  /** ARN of the existing Connect instance */
  instanceArn: string;

  /** ARN of the existing queue (BasicQueue) the contact flows route to */
  queueArn: string;
}

/**
 * Creates a routing profile handling Voice and Chat on the existing queue.
 */
export class ConnectRouting extends Construct {
  public readonly routingProfile: connect.CfnRoutingProfile;

  constructor(scope: Construct, id: string, props: ConnectRoutingProps) {
    super(scope, id);
    const { instanceArn, queueArn } = props;

    this.routingProfile = new connect.CfnRoutingProfile(this, 'RoutingProfile', {
      instanceArn,
      name: 'WebAppRoutingProfile',
      description: 'Voice and chat routing for web app agents',
      defaultOutboundQueueArn: queueArn,
      mediaConcurrencies: [
        {
          channel: 'VOICE',
          concurrency: 1,
          crossChannelBehavior: { behaviorType: 'ROUTE_ANY_CHANNEL' },
        },
        { channel: 'CHAT', concurrency: 2 },
      ],
      queueConfigs: ['VOICE', 'CHAT'].map((channel) => ({
        delay: 0,
        priority: 1,
        queueReference: { channel, queueArn },
      })),
    });
  }
}
