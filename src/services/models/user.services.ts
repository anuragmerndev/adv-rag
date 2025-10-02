import { dbOps } from '../../db/databaseOperations';
import { Tables, User } from '../../db/schemas';

const createNewUser = async (data: Partial<User>) => {
    return await dbOps.insert<User>(Tables.user, data);
};

const getUserbyId = async (id: string) => {
    return await dbOps.findById<User>(Tables.user, id);
};

const updateUser = async (id: string, data: Partial<User>) => {
    return await dbOps.updateById<User>(Tables.user, id, data);
};

const deleteUserbyID = async (id: string) => {
    return await dbOps.deleteById(Tables.user, id);
};

export { createNewUser, getUserbyId, updateUser, deleteUserbyID };
