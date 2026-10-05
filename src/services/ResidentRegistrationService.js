export class ResidentRegistrationService {
  constructor(validator, repository) {
    this.validator = validator;
    this.repository = repository;
  }

  registerResident(resident) {
    const errors = this.validator.validate(resident);

    if (errors.length > 0) {
      return { success: false, resident: null, errors };
    }

    const persistedResident = this.repository.save(resident);

    return { success: true, resident: persistedResident, errors: [] };
  }
}
