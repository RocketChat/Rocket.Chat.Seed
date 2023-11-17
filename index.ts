import fs from 'fs';
import yargs from 'yargs';
import axios from 'axios';
import { faker } from '@faker-js/faker';
import 'axios-debug-log';

axios.defaults.family = 4;

const filePath = 'auth_cache.json';

class RestClient {
	authToken?: string;
	userId?: string;

	constructor(private host: string) {
		axios.defaults.baseURL = this.host;
	}

	async isAuthValid() {
		const endpoint = `/api/v1/me`;

		try {
			const response = await axios.get(endpoint);

			if (response.data.success !== true) {
				throw new Error(`Failed to get me: ${response.data}`);
			}

			return true;
		} catch (error: any) {
			return false;
		}
	}

	async connect(username: string, password: string) {
		const endpoint = `/api/v1/login`;

		if (this.authToken && await this.isAuthValid()) {
			return;
		}

		try {
			const response = await axios.post(endpoint, { username, password });

			if (response.data.status !== 'success') {
				throw new Error(`Failed to login: ${response.data}`);
			}

			if (!response.data.data) {
				throw new Error(`Failed to login: ${response.data}`);
			}

			if (!response.data.data.authToken) {
				throw new Error(`Failed to login: ${response.data}`);
			}

			if (!response.data.data.me.roles?.includes('admin')) {
				throw new Error(`Failed to login, user not admin: ${response.data.data.me.roles}`);
			}

			console.log(`Logged successfully as ${response.data.data.me.username} with id ${response.data.data.me._id}`);

			axios.defaults.headers.common['X-Auth-Token'] = response.data.data.authToken;
			axios.defaults.headers.common['X-User-Id'] = response.data.data.userId;

			this.authToken = response.data.data.authToken;
			this.userId = response.data.data.userId;

			this.saveAuth();
		} catch (error: any) {
			throw new Error(`Failed to connect: ${error.message}`);
		}
	}

	// this function saves the auth token and user id from the class into a file
	// to reuse it later
	async saveAuth() {
		const data = {
			authToken: this.authToken,
			userId: this.userId,
		};


		fs.writeFileSync(filePath, JSON.stringify(data));
	}

	// this function loads the auth token and user id from a file
	async loadAuth() {
		if (!fs.existsSync(filePath)) {
			return;
		}

		const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

		this.authToken = data.authToken;
		this.userId = data.userId;

		axios.defaults.headers.common['X-Auth-Token'] = this.authToken;
		axios.defaults.headers.common['X-User-Id'] = this.userId;
	}

	async logout() {
		const endpoint = `/api/v1/logout`;

		try {
			const response = await axios.post(endpoint, {}, {
				headers: {
					'X-Auth-Token': this.authToken,
					'X-User-Id': this.userId,
				}
			});

			if (response.data.status !== 'success') {
				throw new Error(`Failed to logout: ${response.data}`);
			}

		} catch (error: any) {
			throw new Error(`Failed to logout: ${error.message}`);
		}

		console.log(`Logged out successfully`);
	}

	async createUsers(numUsers: number): Promise<any> {
		const endpoint = `/api/v1/users.create`;

		const users = [];
		for (let i = 0; i < numUsers; i++) {
			const name = faker.person.fullName();
			const username = faker.internet.userName();
			const password = Math.random().toString(36).substring(2); // Generate random password
			const email = faker.internet.email();

			const user = {
				name,
				username,
				password,
				email,
			};

			users.push(user);
		}

		await Promise.all(users.map(async (user) => {
			try {
				const response = await axios.post(endpoint, user);
				if (response.data.success !== true) {
					throw new Error(`Failed to create users: ${JSON.stringify(response.data)}`);
				}
				console.log(`Created user ${response.data.user.username} with id ${response.data.user._id}`);
			} catch (error: any) {
				throw new Error(`Failed to create users: ${error.message}`);
			}
		}));
	}
}

async function main() {
	// Parse command line arguments
	const argv = await yargs
		.option('host', {
			description: 'Host to connect, defaults to http://localhost:3000',
			type: 'string',
			default: 'http://localhost:3000'
		})
		.option('user', {
			description: 'Username, defaults to admin',
			type: 'string',
			default: 'admin'
		})
		.option('password', {
			description: 'Password, defaults to admin',
			type: 'string',
			default: 'admin'
		})
		.option('users', {
			description: 'Number of users to create',
			type: 'number',
		})
		// .option('rooms', {
		// 	description: 'Number of rooms to create',
		// 	type: 'number',
		// })
		.argv;

	const restClient = new RestClient(argv.host);

	await restClient.loadAuth();

	await restClient.connect(argv.user, argv.password);

	// Call the appropriate function based on the command line arguments
	if (argv.users) {
		await restClient.createUsers(argv.users);
	}

	// await restClient.logout();
}

main().catch((error) => {
	console.error(error);
});
