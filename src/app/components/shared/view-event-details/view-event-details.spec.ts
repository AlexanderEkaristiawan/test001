import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewEventDetails } from './view-event-details';

describe('ViewEventDetails', () => {
  let component: ViewEventDetails;
  let fixture: ComponentFixture<ViewEventDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewEventDetails]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewEventDetails);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
